'use client';

import { type ReactNode, useEffect, useRef } from 'react';

export type Poc3LiquidMetalColor = 'chrome' | 'gold' | 'bronze' | 'red' | 'blue' | 'emerald';

type ColorPreset = { trenchBg: string; filter: string };

const COLOR_PRESETS: Record<Poc3LiquidMetalColor, ColorPreset> = {
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

export interface Poc3LiquidMetalNodeBorderProps {
  children: ReactNode;
  /** When false, renders children as a plain passthrough. Default false */
  active?: boolean;
  color?: Poc3LiquidMetalColor;
  /** Border thickness in px. Default 2 */
  borderWidth?: number;
  /**
   * Outer border radius in px. Default 9.
   * innerRadius = borderRadius - borderWidth; set so that innerRadius matches the node's rounded corner (7px).
   */
  borderRadius?: number;
  /** Pattern stripe density 1–10. Default 5 */
  repetition?: number;
  /** Color transition sharpness 0–1. Default 0.46 */
  softness?: number;
  /** Animation speed multiplier. Default 1 */
  timeScale?: number;
  /** Noise distortion amount 0–1. Default 0.2 */
  distortion?: number;
  /** Zoom level 0.01–4. Default 6.9 */
  scale?: number;
  /** Stripe direction in degrees 0–360. Default 44 */
  angle?: number;
}

/**
 * Wraps children with a liquid metal border effect.
 * Renders as position:absolute inset:0 — place inside a position:relative node root.
 * When active:
 *   - shader fills the full area (the ring between wrapper edge and inset content is visible)
 *   - children are placed in position:absolute inset:borderWidth, covering the center
 * When inactive: transparent passthrough (inset:0).
 */
export function Poc3LiquidMetalNodeBorder({
  children,
  active = false,
  color = 'gold',
  borderWidth = 2,
  borderRadius = 9,
  repetition = 5,
  softness = 0.46,
  timeScale = 1,
  distortion = 0.2,
  scale = 6.9,
  angle = 44,
}: Poc3LiquidMetalNodeBorderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shaderRef = useRef<ShaderInstance | null>(null);

  const preset = COLOR_PRESETS[color];
  const innerRadius = Math.max(0, borderRadius - borderWidth);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el || typeof window === 'undefined') return;

    let alive = true;
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

        // speed=0.6 で ShaderMount の内部アニメーションループが自走する。
        // 外部から setUniforms を毎フレーム呼ぶと render() が二重実行されフリッカーが起きるため、
        // 手動の rAF ループは持たず初期 params のみ渡す。
        shaderRef.current = new ShaderMount(
          el,
          liquidMetalFragmentShader,
          params,
          undefined,
          0.6,
        ) as unknown as ShaderInstance;
      } catch {
        // WebGL非対応 → fallbackなし
      }
    })();

    return () => {
      alive = false;
      shaderRef.current?.dispose?.();
      shaderRef.current = null;
    };
  }, [active, repetition, softness, timeScale, distortion, scale, angle]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: `${borderRadius}px`,
        overflow: 'hidden',
        background: active ? preset.trenchBg : 'transparent',
      }}
    >
      {/* Shader canvas — only mounted when active, fills the full area at 140% */}
      {active ? (
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
      ) : null}
      {/* Content area — inset by borderWidth when active, flush when inactive.
          background matches the canvas (#070707) to block the shader from bleeding
          through the node's semi-transparent bg. */}
      <div
        style={{
          position: 'absolute',
          inset: active ? `${borderWidth}px` : 0,
          borderRadius: `${active ? innerRadius : borderRadius}px`,
          background: active ? '#070707' : 'transparent',
          zIndex: 2,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </div>
    </div>
  );
}
