"use client";
import { useEffect, useRef, useState } from "react";

/** Finger/mouse signature capture. Emits a PNG data URL (or "" when cleared). */
export function SignaturePad({ onChange, invalid }: { onChange: (dataUrl: string) => void; invalid?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
      strokes.current = 0;
      setEmpty(true);
      onChange("");
    };
    resize();
    window.addEventListener("orientationchange", resize);
    return () => window.removeEventListener("orientationchange", resize);
  }, [onChange]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    strokes.current++;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (strokes.current > 3) {
      setEmpty(false);
      onChange(canvasRef.current!.toDataURL("image/png"));
    }
  };
  const clear = () => {
    const c = canvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    strokes.current = 0;
    setEmpty(true);
    onChange("");
  };

  return (
    <div>
      <div className={`relative rounded-lg border-2 ${invalid ? "border-red-500" : "border-gray-300"} bg-white`}>
        <canvas
          ref={canvasRef}
          aria-label="Signature area. Sign with your finger or mouse."
          role="img"
          data-testid="signature-pad"
          className="block h-40 w-full touch-none cursor-crosshair"
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end} onPointerCancel={end}
        />
        {empty && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">Sign here</span>}
        <div className="pointer-events-none absolute bottom-8 left-4 right-4 border-b border-gray-300" />
      </div>
      <button type="button" onClick={clear} className="mt-2 text-sm text-gray-600 underline">Clear signature</button>
    </div>
  );
}
