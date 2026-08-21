"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

function PulseLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M9.5 5.5a3 3 0 0 1 4.24 0l4.76 4.76a3 3 0 0 1 0 4.24l-4.76 4.76a3 3 0 0 1-4.24 0l-4.76-4.76a3 3 0 0 1 0-4.24L9.5 5.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
    </svg>
  );
}

function ShaderBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const syncSize = () => {
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(syncSize)
        : null;
    ro?.observe(canvas);
    syncSize();

    const gl =
      (canvas.getContext("webgl") as WebGLRenderingContext | null) ||
      (canvas.getContext(
        "experimental-webgl"
      ) as WebGLRenderingContext | null);
    if (!gl) return;

    const vs = `attribute vec2 a_position;
      varying vec2 v_texCoord;
      void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`;
    const fs = `precision highp float;
      varying vec2 v_texCoord;
      uniform float u_time;
      uniform vec2 u_resolution;
      void main() {
        vec2 uv = v_texCoord;
        vec2 center = vec2(0.5, 0.8);
        float dist = distance(uv, center);
        vec3 color = vec3(0.145, 0.388, 0.922);
        float alpha = smoothstep(0.8, 0.0, dist);
        alpha *= 0.15 + 0.05 * sin(u_time * 0.5);
        gl_FragColor = vec4(color, alpha);
      }`;

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "u_time");
    const uRes = gl.getUniformLocation(program, "u_resolution");

    let raf = 0;
    let cancelled = false;
    const render = (t: number) => {
      if (cancelled) return;
      if (!ro) syncSize();
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, t * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col min-h-screen">
      <header className="fixed top-0 w-full z-50 bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="h-16 max-w-7xl mx-auto px-margin-desktop flex items-center justify-between">
          <Link href="/" className="flex items-center gap-xs text-primary">
            <PulseLogo className="h-8 w-8" />
            <span className="font-headline-md text-primary tracking-tight">
              PulseCRM
            </span>
          </Link>
          <div className="flex items-center gap-md">
            <Link
              href="/login"
              className="font-body-sm text-on-surface-variant hover:text-on-surface hidden sm:block"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="bg-primary text-on-primary font-body-sm px-md py-xs rounded-xl shadow-sm hover:bg-on-primary-fixed-variant transition-all"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main className="w-full pt-16 flex-1">
        <div className="flex flex-col w-full relative min-h-[819px] items-center justify-center overflow-hidden">
          <div className="absolute inset-0 z-0 opacity-40 pointer-events-none">
            <ShaderBackdrop />
          </div>

          <div className="relative z-10 flex flex-col items-center justify-center px-6 lg:px-8 max-w-5xl mx-auto mt-16 mb-24 text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-container-high/50 backdrop-blur-md shadow-sm mb-12">
              <span
                className="material-symbols-outlined text-tertiary"
                style={{
                  fontSize: "16px",
                  fontVariationSettings: "'FILL' 1",
                }}
              >
                bolt
              </span>
              <span className="font-label-uppercase text-on-surface tracking-widest">
                Real-Time Sales Action Engine &amp; Governance
              </span>
            </div>

            <h1 className="font-display-lg text-[48px] md:text-[72px] leading-[1.1] text-on-background tracking-tighter mb-8 max-w-4xl mx-auto drop-shadow-sm">
              Turn Live Events Into Closed-Loop Revenue.
            </h1>

            <p className="font-body-lg text-on-surface-variant max-w-[640px] mx-auto mb-12 leading-relaxed">
              Eliminate passive monthly charts. Ingest live banking events,
              deposits, and digital activity to instantly rank tasks for RMs and
              track live run-rates for managers.
            </p>

            <div className="flex items-center justify-center mb-24">
              <Link
                href="/login"
                className="bg-primary text-on-primary font-body-lg px-8 py-4 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 group w-full sm:w-auto justify-center"
              >
                Get Started
                <span
                  className="material-symbols-outlined group-hover:translate-x-1 transition-transform"
                  style={{ fontSize: "20px" }}
                >
                  arrow_forward
                </span>
              </Link>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 opacity-80 mt-auto">
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-low rounded-lg shadow-sm">
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <span className="font-mono-data text-on-surface-variant">
                  WebSocket Engine: 0ms Latency
                </span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-low rounded-lg shadow-sm">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{
                    fontSize: "16px",
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  bolt
                </span>
                <span className="font-mono-data text-on-surface-variant">
                  Action Prioritization: Active
                </span>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-surface-container-low rounded-lg shadow-sm">
                <span
                  className="material-symbols-outlined text-primary"
                  style={{
                    fontSize: "16px",
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  track_changes
                </span>
                <span className="font-mono-data text-on-surface-variant">
                  Quota Run-Rate Tracking: Live
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="w-full bg-surface-container-lowest border-t border-outline-variant py-xl">
        <div className="max-w-7xl mx-auto px-margin-desktop flex flex-col md:flex-row justify-between items-center gap-md">
          <div className="flex items-center gap-xxs opacity-80 text-on-surface-variant">
            <PulseLogo className="h-6 w-6 opacity-70" />
            <span className="font-label-uppercase text-on-surface-variant tracking-widest">
              PULSECRM &copy; 2024
            </span>
          </div>
          <nav className="flex gap-lg">
            <a
              className="font-body-sm text-on-surface-variant hover:text-on-surface"
              href="#"
            >
              Privacy
            </a>
            <a
              className="font-body-sm text-on-surface-variant hover:text-on-surface"
              href="#"
            >
              Terms
            </a>
            <a
              className="font-body-sm text-on-surface-variant hover:text-on-surface"
              href="#"
            >
              Status
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
