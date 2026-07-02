#!/usr/bin/env bash
# MedAI Server Health Check Script
# Usage: ./scripts/health-check.sh [SERVER_HOST]
# Example: ./scripts/health-check.sh my-server.example.com
# If no host provided, checks localhost

set -euo pipefail

SERVER="${1:-localhost}"
PASS=0
FAIL=0
WARN=0

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
BOLD='\033[1m'

check_service() {
    local name="$1"
    local url="$2"
    local description="$3"
    local timeout="${4:-5}"

    printf "  %-25s" "$name"
    response=$(curl -sf --max-time "$timeout" "$url" 2>&1) && {
        echo -e "${GREEN}OK${NC}  $description"
        ((PASS++))
        return 0
    } || {
        echo -e "${RED}FAIL${NC}  $description"
        ((FAIL++))
        return 1
    }
}

check_docker_status() {
    local name="$1"
    local container="$2"

    printf "  %-25s" "$name"
    status=$(ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "ubuntu@${SERVER}" \
        "sudo docker inspect --format='{{.State.Health.Status}}' $container 2>/dev/null || echo 'not_found'" 2>/dev/null) || status="ssh_failed"

    case "$status" in
        healthy)
            echo -e "${GREEN}healthy${NC}"
            ((PASS++))
            ;;
        "health: starting"|starting)
            echo -e "${YELLOW}starting${NC} (model may still be loading)"
            ((WARN++))
            ;;
        unhealthy)
            echo -e "${RED}unhealthy${NC}"
            ((FAIL++))
            ;;
        not_found)
            echo -e "${RED}container not found${NC}"
            ((FAIL++))
            ;;
        ssh_failed)
            echo -e "${YELLOW}skipped (SSH not available)${NC}"
            ((WARN++))
            ;;
        *)
            echo -e "${YELLOW}$status${NC}"
            ((WARN++))
            ;;
    esac
}

echo ""
echo -e "${BOLD}MedAI Server Health Check${NC}"
echo -e "Target: ${BOLD}${SERVER}${NC}"
echo "========================================"
echo ""

# --- Docker Container Status (via SSH if remote) ---
if [ "$SERVER" != "localhost" ] && [ "$SERVER" != "127.0.0.1" ]; then
    echo -e "${BOLD}1. Docker Container Status (via SSH)${NC}"
    echo "----------------------------------------"

    # Try SSH first
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "ubuntu@${SERVER}" "echo ok" &>/dev/null; then
        containers=$(ssh -o StrictHostKeyChecking=no "ubuntu@${SERVER}" \
            "sudo docker ps -a --format '{{.Names}}\t{{.Status}}'" 2>/dev/null)
        if [ -n "$containers" ]; then
            echo "$containers" | while IFS=$'\t' read -r name status; do
                printf "  %-25s %s\n" "$name" "$status"
            done
        else
            echo "  No containers found"
        fi
    else
        echo -e "  ${YELLOW}SSH not available — skipping container checks${NC}"
    fi
    echo ""
fi

# --- API Gateway (nginx) ---
echo -e "${BOLD}2. API Gateway (nginx :8002)${NC}"
echo "----------------------------------------"
check_service "Gateway Health" "http://${SERVER}:8002/health" "API gateway responding"
echo ""

# --- Inference Service (MONAI Label) ---
echo -e "${BOLD}3. Inference Service (MONAI :8001)${NC}"
echo "----------------------------------------"
check_service "Inference /monai/info" "http://${SERVER}:8002/monai/info/" "MONAI Label models loaded" 10
# Check specific models
if response=$(curl -sf --max-time 10 "http://${SERVER}:8002/monai/info/" 2>/dev/null); then
    for model in biomedparse totalsegmentator segmentation breast_tumor; do
        printf "  %-25s" "  Model: $model"
        if echo "$response" | grep -q "\"$model\""; then
            echo -e "${GREEN}loaded${NC}"
        else
            echo -e "${RED}missing${NC}"
        fi
    done
fi
echo ""

# --- MedGemma VLM ---
echo -e "${BOLD}4. MedGemma VLM (:8004 wrapper, vLLM internal)${NC}"
echo "----------------------------------------"
check_service "MedGemma Wrapper" "http://${SERVER}:8002/monai/medgemma/health" "Wrapper service responding" 5
# Check via direct port too
check_service "MedGemma Direct" "http://${SERVER}:8004/health" "Direct wrapper access" 5
echo ""

# --- LLM Service ---
echo -e "${BOLD}5. LLM Service (:8003)${NC}"
echo "----------------------------------------"
check_service "LLM Health" "http://${SERVER}:8003/health" "LangChain LLM service"
# Check LLM config
if response=$(curl -sf --max-time 5 "http://${SERVER}:8003/health" 2>/dev/null); then
    printf "  %-25s" "  LLM Provider"
    provider=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('llm_provider','unknown'))" 2>/dev/null || echo "unknown")
    configured=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin).get('llm_configured',False))" 2>/dev/null || echo "unknown")
    if [ "$configured" = "True" ]; then
        echo -e "${GREEN}${provider}${NC} (configured)"
    else
        echo -e "${RED}${provider}${NC} (NOT configured — check .env API keys)"
    fi
fi
echo ""

# --- Chat Service ---
echo -e "${BOLD}6. Chat Service (:8005 internal)${NC}"
echo "----------------------------------------"
check_service "Chat Health" "http://${SERVER}:8002/monai/chat/health" "Chat via gateway" 5
echo ""

# --- Orthanc PACS ---
echo -e "${BOLD}7. Orthanc PACS (:8042 / :4242)${NC}"
echo "----------------------------------------"
check_service "Orthanc REST API" "http://${SERVER}:8042/system" "Orthanc HTTP responding" 5
check_service "Orthanc DICOMweb" "http://${SERVER}:8042/dicom-web/studies" "DICOMweb endpoint" 5
echo ""

# --- GPU Status (via SSH) ---
if [ "$SERVER" != "localhost" ] && [ "$SERVER" != "127.0.0.1" ]; then
    echo -e "${BOLD}8. GPU Status${NC}"
    echo "----------------------------------------"
    if ssh -o StrictHostKeyChecking=no -o ConnectTimeout=5 "ubuntu@${SERVER}" "echo ok" &>/dev/null; then
        ssh -o StrictHostKeyChecking=no "ubuntu@${SERVER}" \
            "nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader" 2>/dev/null | \
            while IFS=',' read -r name mem_used mem_total gpu_util; do
                echo "  GPU: $name"
                echo "  VRAM: $mem_used /$mem_total (Utilization:$gpu_util)"
            done
    else
        echo -e "  ${YELLOW}SSH not available${NC}"
    fi
    echo ""
fi

# --- Summary ---
echo "========================================"
echo -e "${BOLD}Summary${NC}"
echo -e "  ${GREEN}Passed: ${PASS}${NC}"
[ "$WARN" -gt 0 ] && echo -e "  ${YELLOW}Warnings: ${WARN}${NC}"
[ "$FAIL" -gt 0 ] && echo -e "  ${RED}Failed: ${FAIL}${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}Some services are down. See troubleshooting guide:${NC}"
    echo "  docs/server-setup.md"
    exit 1
else
    echo -e "${GREEN}All checked services are operational.${NC}"
    exit 0
fi
