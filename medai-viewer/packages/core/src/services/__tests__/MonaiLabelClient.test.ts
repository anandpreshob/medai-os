import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonaiLabelClient, ServerInfo, InferenceResult } from '../MonaiLabelClient';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('MonaiLabelClient', () => {
  let client: MonaiLabelClient;
  const serverUrl = 'http://localhost:8002';

  beforeEach(() => {
    client = new MonaiLabelClient(serverUrl);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create client with server URL', () => {
      expect(client.serverUrl).toBe(serverUrl);
    });

    it('should normalize URL by removing trailing slash', () => {
      const clientWithSlash = new MonaiLabelClient('http://localhost:8002/');
      expect(clientWithSlash.serverUrl).toBe('http://localhost:8002');
    });
  });

  describe('info()', () => {
    const mockServerInfo: ServerInfo = {
      name: 'MONAI Label',
      version: '0.8.0',
      models: {
        sam3: {
          type: 'segmentation',
          labels: ['background', 'organ'],
          description: 'SAM3 model for 3D segmentation',
        },
        nninteractive: {
          type: 'deepedit',
          labels: ['spleen', 'liver', 'kidney'],
          description: 'nnInteractive model',
        },
      },
    };

    it('should fetch server info from /info endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServerInfo),
      });

      const info = await client.info();

      expect(mockFetch).toHaveBeenCalledWith(`${serverUrl}/info`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      expect(info).toEqual(mockServerInfo);
    });

    it('should return models from server info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServerInfo),
      });

      const info = await client.info();

      expect(info.models).toBeDefined();
      expect(Object.keys(info.models)).toContain('sam3');
      expect(Object.keys(info.models)).toContain('nninteractive');
    });

    it('should throw error on connection failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.info()).rejects.toThrow('Failed to connect to MONAI Label server');
    });

    it('should throw error on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.info()).rejects.toThrow('Server returned 500');
    });
  });

  describe('infer()', () => {
    const mockImageData = new ArrayBuffer(100);
    const mockParams = {
      pos_points: [[100, 100, 50]],
      neg_points: [],
    };

    it('should send inference request with FormData', async () => {
      const mockResponse = createMockMultipartResponse();
      mockFetch.mockResolvedValueOnce(mockResponse);

      await client.infer('sam3', mockImageData, mockParams);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${serverUrl}/infer/sam3?output=all`);
      expect(options.method).toBe('POST');
      expect(options.body).toBeInstanceOf(FormData);
    });

    it('should include params in FormData', async () => {
      const mockResponse = createMockMultipartResponse();
      mockFetch.mockResolvedValueOnce(mockResponse);

      await client.infer('sam3', mockImageData, mockParams);

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      const paramsJson = formData.get('params') as string;
      const parsedParams = JSON.parse(paramsJson);

      expect(parsedParams.pos_points).toEqual([[100, 100, 50]]);
      expect(parsedParams.result_extension).toBe('.nrrd');
      expect(parsedParams.result_dtype).toBe('uint16');
    });

    it('should include image file in FormData', async () => {
      const mockResponse = createMockMultipartResponse();
      mockFetch.mockResolvedValueOnce(mockResponse);

      await client.infer('sam3', mockImageData, mockParams);

      const formData = mockFetch.mock.calls[0][1].body as FormData;
      const file = formData.get('file');

      expect(file).toBeInstanceOf(Blob);
    });

    it('should throw error on inference failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
      });

      await expect(client.infer('sam3', mockImageData, mockParams)).rejects.toThrow(
        'Inference failed'
      );
    });
  });

  describe('parseMultipartResponse()', () => {
    it('should parse multipart response with JSON and NRRD parts', async () => {
      const mockResponse = createMockMultipartResponse();
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await client.infer('sam3', new ArrayBuffer(100), {});

      expect(result).toBeDefined();
      expect(result.mask).toBeInstanceOf(ArrayBuffer);
      expect(result.metadata).toBeDefined();
    });

    it('should extract centroids from metadata', async () => {
      const mockResponse = createMockMultipartResponse();
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await client.infer('sam3', new ArrayBuffer(100), {});

      expect(result.metadata.centroids).toBeDefined();
    });
  });

  describe('getModelList()', () => {
    it('should return list of model names', async () => {
      const mockServerInfo: ServerInfo = {
        name: 'MONAI Label',
        version: '0.8.0',
        models: {
          sam3: { type: 'segmentation', labels: [], description: '' },
          nninteractive: { type: 'deepedit', labels: [], description: '' },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServerInfo),
      });

      const models = await client.getModelList();

      expect(models).toEqual(['sam3', 'nninteractive']);
    });
  });
});

// Helper function to create mock multipart response
function createMockMultipartResponse(): Response {
  const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
  const jsonPart = JSON.stringify({
    centroids: { 1: [100, 100, 50] },
    label_names: { 1: 'organ' },
  });

  // Create a simple mock NRRD header + data
  const nrrdData = new Uint8Array([
    // NRRD header simulation (simplified)
    0x4e, 0x52, 0x52, 0x44, // "NRRD"
    0x00, 0x00, 0x00, 0x00, // padding
  ]);

  const body = [
    `--${boundary}\r\n`,
    'Content-Disposition: form-data; name="result"\r\n',
    'Content-Type: application/json\r\n\r\n',
    jsonPart,
    `\r\n--${boundary}\r\n`,
    'Content-Disposition: form-data; name="image"; filename="output.nrrd"\r\n',
    'Content-Type: application/octet-stream\r\n\r\n',
  ].join('');

  // Combine text and binary data
  const encoder = new TextEncoder();
  const textPart = encoder.encode(body);
  const endBoundary = encoder.encode(`\r\n--${boundary}--\r\n`);

  const combined = new Uint8Array(textPart.length + nrrdData.length + endBoundary.length);
  combined.set(textPart, 0);
  combined.set(nrrdData, textPart.length);
  combined.set(endBoundary, textPart.length + nrrdData.length);

  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    }),
    arrayBuffer: () => Promise.resolve(combined.buffer),
  } as unknown as Response;
}
