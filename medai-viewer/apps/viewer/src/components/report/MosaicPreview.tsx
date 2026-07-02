import React from 'react';
import { ZoomIn, ZoomOut, Download } from 'lucide-react';
import { Button } from '@medai/ui';

interface MosaicPreviewProps {
  imageDataUrl: string | null;
  className?: string;
}

export function MosaicPreview({ imageDataUrl, className = '' }: MosaicPreviewProps) {
  const [zoom, setZoom] = React.useState(1);
  const imageRef = React.useRef<HTMLImageElement>(null);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  };

  const handleDownload = () => {
    if (!imageDataUrl) return;

    const link = document.createElement('a');
    link.href = imageDataUrl;
    link.download = `mosaic-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!imageDataUrl) {
    return (
      <div className={`bg-background-secondary rounded-lg flex items-center justify-center h-64 ${className}`}>
        <p className="text-text-muted">No image captured</p>
      </div>
    );
  }

  return (
    <div className={`bg-background-secondary rounded-lg overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <span className="text-sm font-medium text-text-secondary">Viewport Mosaic</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-xs text-text-muted w-12 text-center">{Math.round(zoom * 100)}%</span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-4 bg-border-subtle mx-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleDownload}
            title="Download image"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Image container */}
      <div className="overflow-auto max-h-96 bg-black">
        <div
          className="flex items-center justify-center min-h-64 p-4"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          <img
            ref={imageRef}
            src={imageDataUrl}
            alt="Viewport mosaic showing axial, sagittal, and coronal views"
            className="max-w-full h-auto rounded shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}
