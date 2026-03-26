import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

import { AuroraBackground } from '../components/ui/aurora-background';
import { ShimmerText } from '../components/ui/shimmer-text';
import { SpotlightCard } from '../components/ui/spotlight-card';
import { TextEffect } from '../components/ui/text-effect';
import { VanishInput } from '../components/ui/vanish-input';

export default function UiComponentPage() {
  const [prompt, setPrompt] = React.useState(
    'この PR の要点を 3 行で要約して、リスクも出してください。',
  );

  const placeholders = [
    'レビュー対象の diff を指定して、指摘を抽出する',
    'Codex と Copilot に同じ指示を送り、比較する',
    'structured response と rich text response を同時に表示する',
  ];

  const cards = [
    {
      eyebrow: 'Streaming',
      title: 'Agent Responses',
      description:
        'ストリーミング本文を shimmer と text effect で流し込み、会話の進行をそのまま UI に残します。',
      accent: '#67e8f9',
      details: [
        'Codex / Copilot の出力差分を同じレイアウトで比較可能',
        'Structured response と自由文レスポンスを同時に配置',
        '長文でも視線が流れやすいコントラストに調整',
      ],
    },
    {
      eyebrow: 'Threads',
      title: 'Review Cards',
      description:
        'Kokonut UI の spotlight cards 風に、レビュー結果やスレッド候補をカードで一覧化します。',
      accent: '#f9a8d4',
      details: [
        'ホバーで対象カードだけを強調し、他は自然に背景へ退避',
        'PoC で必要な情報だけを card 単位で切り出しやすい',
        '今後の diff viewer や inline comment へ拡張しやすい構成',
      ],
    },
    {
      eyebrow: 'Input',
      title: 'Prompt Composer',
      description:
        'Aceternity の vanish input 風に、入力と送信を UI の主役として扱うためのコマンドバーです。',
      accent: '#fde68a',
      details: [
        '入力後の vanish 演出で送信アクションを強調',
        'プレースホルダー切り替えで PoC シナリオを誘導',
        'cwd 選択や agent 切り替えの導線も追加しやすい余白を確保',
      ],
    },
  ];

  const responsePoints = [
    '差分の構造を先に解析し、インラインコメント候補を抽出します。',
    'UI 上では structured response を右カラム、自由文の補足を左カラムへ分離します。',
    'スレッド返信が来た場合は同じセッションを引き継いで応答します。',
  ];

  return (
    <React.Fragment>
      <Head>
        <title>Coding Agent Thread App | UI Component Demo</title>
      </Head>
      <AuroraBackground className="min-h-screen">
        <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-5 py-10 sm:px-8 lg:px-10">
          <section className="grid items-start gap-8 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="flex flex-col gap-6">
              <div className="glass-panel inline-flex w-fit items-center gap-4 rounded-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.34em] text-cyan-100">
                <Image
                  src="/images/logo.png"
                  alt="Coding Agent Thread App logo"
                  width={34}
                  height={34}
                  priority
                  className="h-[34px] w-[34px] rounded-full border border-white/10 bg-white/10 p-1"
                />
                UI Component Demo
              </div>

              <div className="space-y-5">
                <p className="text-sm uppercase tracking-[0.44em] text-cyan-100/70">
                  Nextron + Next.js + Electron
                </p>
                <div className="space-y-4">
                  <TextEffect
                    as="h1"
                    text="Coding Agent Thread App"
                    className="max-w-4xl text-5xl font-semibold leading-[1.02] tracking-[-0.06em] text-white sm:text-6xl lg:text-[5.4rem]"
                  />
                  <ShimmerText
                    text="ストリーミング応答、カード要約、消える入力をひとつのスレッド UI に統合"
                    className="block max-w-3xl text-lg font-medium leading-8 sm:text-xl"
                  />
                </div>
                <p className="max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
                  `.memo/ui-library.md` の候補を新規ページへ切り出した、UI
                  ライブラリ検証用のデモ画面です。
                </p>
              </div>

              <VanishInput placeholders={placeholders} onSubmit={setPrompt} className="max-w-3xl" />

              <div className="flex flex-wrap gap-3 text-sm text-slate-200">
                <span className="glass-panel rounded-full px-4 py-2">Codex Stream Ready</span>
                <span className="glass-panel rounded-full px-4 py-2">Copilot ACP Ready</span>
                <span className="glass-panel rounded-full px-4 py-2">
                  Pages Router / Tailwind v4
                </span>
              </div>

              <div className="flex flex-wrap gap-4">
                <Link
                  href="/next"
                  className="inline-flex items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  サンプルページを開く
                </Link>
                <a
                  href="https://motion-primitives.com/docs/text-effect"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/6 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  参照 UI を確認
                </a>
              </div>
            </div>

            <div className="glass-panel relative overflow-hidden rounded-[2rem] p-6 sm:p-8">
              <div className="absolute right-0 top-0 h-36 w-36 rounded-full bg-cyan-300/20 blur-3xl" />
              <div className="absolute bottom-0 left-10 h-28 w-28 rounded-full bg-pink-300/18 blur-3xl" />

              <div className="relative z-10 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.34em] text-white/55">
                    Live Response Preview
                  </p>
                  <ShimmerText
                    text="Streaming agent output"
                    className="mt-2 text-2xl font-semibold"
                  />
                </div>
                <span className="rounded-full border border-white/12 bg-black/25 px-3 py-1 text-xs uppercase tracking-[0.26em] text-slate-300">
                  session /ui-component
                </span>
              </div>

              <div className="relative z-10 mt-8 space-y-4">
                <div className="ml-auto max-w-[28rem] rounded-[1.6rem] border border-cyan-200/12 bg-white/8 px-5 py-4 text-sm leading-7 text-cyan-50 shadow-[0_18px_45px_rgba(8,15,26,0.26)]">
                  {prompt}
                </div>

                <div className="max-w-[34rem] rounded-[1.8rem] border border-white/12 bg-black/28 px-5 py-5 shadow-[0_18px_55px_rgba(2,8,23,0.30)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.34em] text-cyan-100/70">
                        Codex Agent
                      </p>
                      <p className="mt-1 text-sm text-slate-400">text effect + shimmer response</p>
                    </div>
                    <span className="rounded-full border border-emerald-300/18 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
                      streaming
                    </span>
                  </div>

                  <TextEffect
                    key={prompt}
                    as="p"
                    text={`「${prompt}」を受け取りました。差分の構造を先に把握し、レビュー要約とインライン指摘候補を同じスレッド上に並べます。`}
                    className="mt-5 text-lg leading-8 text-white"
                    wordClassName="mb-1"
                  />

                  <ul className="mt-6 space-y-3 text-sm leading-7 text-slate-300">
                    {responsePoints.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-cyan-300" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-100/70">
                        Thread Summary
                      </p>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        structured response の概要カードをここに追加して diff / comment thread
                        へ繋ぎます。
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-center text-sm text-white">
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                        <p className="text-2xl font-semibold">02</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.26em] text-slate-400">
                          agents
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                        <p className="text-2xl font-semibold">03</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.26em] text-slate-400">
                          outputs
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <SpotlightCard key={card.title} {...card} />
            ))}
          </section>
        </main>
      </AuroraBackground>
    </React.Fragment>
  );
}
