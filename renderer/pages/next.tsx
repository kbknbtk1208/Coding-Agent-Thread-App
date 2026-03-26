import React from 'react'
import Head from 'next/head'
import Link from 'next/link'

export default function NextPage() {
  return (
    <React.Fragment>
      <Head>
        <title>Sample Page | Coding Agent Thread App</title>
      </Head>
      <main className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl shadow-black/30 backdrop-blur">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            Sample Route
          </p>
          <h1 className="mb-4 text-3xl font-bold text-white">
            Nextron のページ遷移は動作しています
          </h1>
          <p className="mx-auto mb-8 max-w-xl text-base leading-7 text-slate-300">
            `renderer/pages` 配下の Pages Router 構成をそのまま使っています。ここから
            UI 実装を広げていけば十分です。
          </p>
          <Link
            href="/home"
            className="rounded-full border border-cyan-400/40 px-5 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-300 hover:text-white"
          >
            ホームへ戻る
          </Link>
        </div>
      </main>
    </React.Fragment>
  )
}
