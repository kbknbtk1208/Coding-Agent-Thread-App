import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

import { SessionConsole } from '../components/sessionConsole';

export default function HomePage() {
  return (
    <React.Fragment>
      <Head>
        <title>Coding Agent Thread App</title>
      </Head>
      <main className="mx-auto flex w-full max-w-7xl flex-col px-5 py-10 sm:px-8 lg:px-10">
        <section className="flex min-h-[calc(100vh-5rem)] items-center justify-center">
          <div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur">
            <div className="mb-6">
              <Image
                className="mx-auto"
                src="/images/logo.png"
                alt="Coding Agent Thread App logo"
                width={144}
                height={144}
                priority
              />
            </div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Nextron + Next.js + Electron + Tailwind CSS
            </p>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-white">
              Coding Agent Thread App
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-base leading-7 text-slate-300">
              TypeScript を前提にした Nextron アプリの初期構築です。ここから Electron
              のメインプロセスと Next.js の UI を同じリポジトリで育てられます。
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-sm text-slate-200">
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2">
                TypeScript Ready
              </span>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2">
                Pages Router
              </span>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-2">
                IPC Bridge Enabled
              </span>
            </div>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/next"
                className="rounded-full bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                サンプルページを開く
              </Link>
              <Link
                href="/ui-component"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                UI Component を開く
              </Link>
              <Link
                href="/mr"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                MR Review を開く
              </Link>
              <Link
                href="/graph-review"
                className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Graph Review を開く
              </Link>
            </div>
          </div>
        </section>
        <SessionConsole />
      </main>
    </React.Fragment>
  );
}
