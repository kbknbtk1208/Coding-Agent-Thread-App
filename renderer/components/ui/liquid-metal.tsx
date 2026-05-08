'use client';

import React, { useEffect, useRef } from 'react';

export type LiquidMetalColor = 'chrome' | 'gold' | 'bronze' | 'red' | 'blue' | 'emerald';

export interface LiquidMetalProps {
  children: React.ReactNode;
  color?: LiquidMetalColor;
  /** Border thickness in px. Default 3 */
  borderWidth?: number;
  /** Border radius in px or CSS string. Default 50 */
  borderRadius?: number | string;
  /** Pattern stripe density 1–10. Default 5 */
  repetition?: number;
  /** Color transition sharpness 0–1 (0=hard, 1=smooth). Default 0.46 */
  softness?: number;
  /** Multiplier for the offset animation speed. Default 1 */
  timeScale?: number;
  /** Noise distortion amount 0–1. Default 0.2 */
  distortion?: number;
  /** Overall zoom level 0.01–4. Default 6.9 */
  scale?: number;
  /** Animation stripe direction in degrees 0–360. Default 44 */
  angle?: number;
  className?: string;
}

type ColorPreset = { trenchBg: string; filter: string };

const COLOR_PRESETS: Record<LiquidMetalColor, ColorPreset> = {
  chrome: {
    trenchBg: '#000000',
    filter: 'contrast(1.12) brightness(1.08)',
  },
  gold: {
    trenchBg: '#321B00',
    filter: 'sepia(0.65) saturate(5) hue-rotate(-20deg) contrast(1.2) brightness(0.93)',
  },
  bronze: {
    trenchBg: '#2a150a',
    filter: 'sepia(0.65) saturate(5) hue-rotate(-40deg) contrast(1.2) brightness(0.93)',
  },
  red: {
    trenchBg: '#300000',
    filter: 'sepia(0) saturate(14) hue-rotate(140deg) contrast(1.45) brightness(0.92)',
  },
  blue: {
    trenchBg: '#000520',
    filter: 'sepia(0) saturate(14) hue-rotate(-45deg) contrast(1.45) brightness(0.92)',
  },
  emerald: {
    trenchBg: '#002010',
    filter: 'sepia(1) saturate(10) hue-rotate(120deg) contrast(1.2) brightness(0.98)',
  },
};

type ShaderInstance = {
  setUniforms?: (u: Record<string, number | boolean>) => void;
  dispose?: () => void;
};

export function LiquidMetal({
  children,
  color = 'chrome',
  borderWidth = 3,
  borderRadius = 50,
  repetition = 5,
  softness = 0.46,
  timeScale = 1,
  distortion = 0.2,
  scale = 6.9,
  angle = 44,
  className,
}: LiquidMetalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shaderRef = useRef<ShaderInstance | null>(null);
  const tRef = useRef(0);

  const preset = COLOR_PRESETS[color];
  const radius = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius;
  const innerRadius =
    typeof borderRadius === 'number'
      ? `${Math.max(0, borderRadius - borderWidth)}px`
      : `calc(${radius} - ${borderWidth}px)`;

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;

    let alive = true;
    let animId = 0;
    const params: Record<string, number | boolean> = {
      u_repetition: repetition,
      u_softness: softness,
      u_distortion: distortion,
      u_angle: angle,
      u_scale: scale,
      u_shiftRed: 0,
      u_shiftBlue: 0,
      u_contour: 0.1,
      u_shape: 1,
      u_isImage: false,
      u_offsetX: 0,
      u_offsetY: 0,
    };

    void (async () => {
      try {
        const { liquidMetalFragmentShader, ShaderMount } = await import('@paper-design/shaders');
        if (!alive) return;

        const instance = new ShaderMount(el, liquidMetalFragmentShader, params, undefined, 0.6);
        shaderRef.current = instance as unknown as ShaderInstance;

        const tick = () => {
          if (!alive) return;
          tRef.current += 0.01;
          const s = timeScale || 1;
          params.u_offsetX = Math.sin(tRef.current * s) * 0.4;
          params.u_offsetY = Math.cos(tRef.current * s) * 0.4;
          (instance as unknown as ShaderInstance).setUniforms?.(params);
          animId = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // WebGL 非対応 → solid border のまま表示
      }
    })();

    return () => {
      alive = false;
      cancelAnimationFrame(animId);
      shaderRef.current?.dispose?.();
      shaderRef.current = null;
    };
  }, [repetition, softness, timeScale, distortion, scale, angle]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        overflow: 'hidden',
        background: preset.trenchBg,
        borderRadius: radius,
        boxShadow: '0 20px 50px rgba(0,0,0,0.15), inset 0 1px 2px rgba(255,255,255,0.08)',
      }}
    >
      {/* Shader canvas — oversized and centered so the edge bleeds into the visible border */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          width: '140%',
          height: '140%',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          filter: preset.filter,
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
      {/* Children — sits above the shader, creates the "inside" of the frame */}
      <div
        style={{
          position: 'relative',
          margin: `${borderWidth}px`,
          borderRadius: innerRadius,
          zIndex: 2,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}
