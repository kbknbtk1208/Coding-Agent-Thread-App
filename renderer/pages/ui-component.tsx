import React from 'react';
import Head from 'next/head';
import {
  Activity,
  Bot,
  Command,
  FileCode2,
  FolderGit2,
  MessageSquareMore,
  Rows3,
  SearchCheck,
  SendHorizontal,
  Sparkles,
} from 'lucide-react';

import { AuroraBackground } from '../components/ui/aurora-background';
import { ShimmerText } from '../components/ui/shimmer-text';
import { TextEffect } from '../components/ui/text-effect';
import { VanishInput } from '../components/ui/vanish-input';
import { ActivitiesCard } from '../components/ui/activities-card';
import { CommandSearch, type CommandItem } from '../components/ui/command-search';
import { CreateNewDisclosure } from '../components/ui/create-new-disclosure';
import ExpandableCards from '../components/ui/expandable-cards';
import ExpandableDock from '../components/ui/expandable-dock';
import { FeedbackComponent } from '../components/ui/feedback';
import { FlexNavbar } from '../components/ui/flex-navbar';
import { FloatingDisclosure, items as floatingItems } from '../components/ui/floating-disclosure';
import FolderTree from '../components/ui/folder-tree';
import { Glass } from '../components/ui/glass';
import { ListStack } from '../components/ui/list-stack';
import { MacOSSidebar } from '../components/ui/macos-sidebar';
import MagicDock, { type DockItemData } from '../components/ui/magicdock';
import { ScrollIsland, type Topic } from '../components/ui/scroll-island';
import {
  ScrollXCarousel,
  ScrollXCarouselContainer,
  ScrollXCarouselProgress,
  ScrollXCarouselWrap,
} from '../components/systaliko-ui/scroll-x-carousel';
import {
  ThoughtChain,
  ThoughtChainContent,
  ThoughtChainItem,
  ThoughtChainStep,
  ThoughtChainTrigger,
} from '../components/odysseyui/thought-chain';

type OverlayDemo = 'none' | 'flex' | 'dock' | 'magic' | 'island';

function Card({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-panel rounded-[1.8rem] p-5 ${className}`}>
      <p className="mb-4 text-xs uppercase tracking-[0.3em] text-cyan-100/55">{title}</p>
      {children}
    </section>
  );
}

export default function UiComponentPage() {
  const [prompt, setPrompt] = React.useState(
    '第二陣コンポーネントを review-assistant UI に接続する。',
  );
  const [overlay, setOverlay] = React.useState<OverlayDemo>('none');

  const commandItems = React.useMemo<CommandItem[]>(
    () => [
      {
        id: 'summary',
        title: 'Summary',
        section: 'Suggestions',
        icon: <Sparkles size={16} />,
        action: () => setPrompt('要約カードを右カラムへ出す。'),
      },
      {
        id: 'threads',
        title: 'Threads',
        section: 'Suggestions',
        icon: <MessageSquareMore size={16} />,
        action: () => setPrompt('thread 候補を一覧化する。'),
      },
      {
        id: 'runtime',
        title: 'Runtime',
        section: 'Settings',
        icon: <Bot size={16} />,
        shortcut: '⌘ R',
        action: () => setPrompt('Codex / Copilot を切り替える。'),
      },
      {
        id: 'docs',
        title: 'Docs',
        section: 'Help',
        icon: <SearchCheck size={16} />,
        action: () => setPrompt('reference と architecture を開く。'),
      },
    ],
    [],
  );

  const dockItems: DockItemData[] = [
    {
      id: 1,
      icon: <Bot className="h-5 w-5 text-cyan-200" />,
      label: 'Codex',
      description: 'Run',
      onClick: () => setPrompt('Codex を再実行する。'),
    },
    {
      id: 2,
      icon: <Command className="h-5 w-5 text-amber-200" />,
      label: 'Palette',
      description: 'Open',
      onClick: () => setPrompt('command palette を開く。'),
    },
    {
      id: 3,
      icon: <FolderGit2 className="h-5 w-5 text-emerald-200" />,
      label: 'Tree',
      description: 'Files',
      onClick: () => setPrompt('folder tree を同期する。'),
    },
    {
      id: 4,
      icon: <SendHorizontal className="h-5 w-5 text-pink-200" />,
      label: 'Reply',
      description: 'Post',
      onClick: () => setPrompt('返信候補を投稿する。'),
    },
  ];

  const topics: Topic[] = [
    {
      id: 'ingest',
      title: 'Diff ingest',
      content: '差分を review gateway で吸い上げ、行番号を thread state に紐付けます。',
    },
    {
      id: 'analysis',
      title: 'Agent analysis',
      content: 'Codex / Copilot の structured response を同じ schema に寄せます。',
    },
    {
      id: 'actions',
      title: 'Reviewer actions',
      content: '採用、却下、修正依頼を action panel に集約します。',
    },
  ];

  return (
    <React.Fragment>
      <Head>
        <title>Coding Agent Thread App | UI Component Wave 2</title>
      </Head>
      <AuroraBackground className="min-h-screen">
        <main className="mx-auto flex min-h-screen w-full max-w-[96rem] flex-col px-5 py-10 sm:px-8">
          <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <p className="glass-panel inline-flex rounded-full px-4 py-3 text-xs font-semibold uppercase tracking-[0.32em] text-cyan-100">
                UI Library Wave 2
              </p>
              <TextEffect
                as="h1"
                text="Second Batch Installed"
                className="text-5xl font-semibold tracking-[-0.06em] text-white sm:text-6xl"
              />
              <ShimmerText
                text="watermelon / scrollx / odyssey 系をこのページへ集約"
                className="block max-w-3xl text-lg leading-8 sm:text-xl"
              />
              <p className="max-w-3xl text-base leading-8 text-slate-300">
                固定配置系は下の switch
                で切り替え、通常コンポーネントはギャラリーとして常設しています。
              </p>
              <VanishInput
                placeholders={[
                  'dock や navbar の見せ方を詰める',
                  'command search を runtime 導線に接続する',
                  'thought chain を review summary に埋め込む',
                ]}
                onSubmit={setPrompt}
                className="max-w-3xl"
              />
            </div>
            <Card title="Prompt State">
              <div className="space-y-4">
                <div className="rounded-[1.4rem] border border-cyan-200/12 bg-white/8 px-5 py-4 text-sm leading-7 text-cyan-50">
                  {prompt}
                </div>
                <ul className="space-y-2 text-sm leading-7 text-slate-300">
                  <li>Watermelon 系は `renderer/components/ui` へ集約。</li>
                  <li>ScrollX / Odyssey 系は専用フォルダへ移動。</li>
                  <li>fixed overlay は selector から個別に有効化。</li>
                </ul>
              </div>
            </Card>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-3">
            <Card title="Activities Card">
              <div className="flex justify-center">
                <ActivitiesCard
                  headerIcon={<Activity className="h-6 w-6 text-slate-700 dark:text-slate-200" />}
                  title="Review Timeline"
                  subtitle="PR #128 discussion"
                  activities={[
                    {
                      icon: <Bot className="h-5 w-5" />,
                      title: 'Codex Review',
                      desc: '差分構造の抽出',
                      time: 'Now',
                    },
                    {
                      icon: <MessageSquareMore className="h-5 w-5" />,
                      title: 'Thread Reply',
                      desc: '返信候補の整理',
                      time: '5m',
                    },
                    {
                      icon: <FileCode2 className="h-5 w-5" />,
                      title: 'Patch Plan',
                      desc: '修正候補のまとめ',
                      time: '12m',
                    },
                  ]}
                />
              </div>
            </Card>
            <Card title="Create Disclosure">
              <div className="flex min-h-[250px] items-center justify-center">
                <CreateNewDisclosure initialOpen />
              </div>
            </Card>
            <Card title="Feedback">
              <FeedbackComponent
                onSubmit={({ rating, feedback }) =>
                  setPrompt(`Feedback(${rating}): ${feedback || 'コメントなし'}`)
                }
              />
            </Card>
            <Card title="List Stack">
              <div className="min-h-[360px]">
                <ListStack
                  items={[
                    { id: '1', title: 'Summary', location: 'overview', date: 'Now', icon: Rows3 },
                    {
                      id: '2',
                      title: 'Inline',
                      location: 'diff',
                      date: '5m',
                      icon: MessageSquareMore,
                    },
                    {
                      id: '3',
                      title: 'Reply',
                      location: 'thread',
                      date: '12m',
                      icon: SendHorizontal,
                    },
                  ]}
                />
              </div>
            </Card>
            <Card title="Command Search">
              <div className="flex min-h-[240px] items-center justify-center">
                <CommandSearch items={commandItems} />
              </div>
            </Card>
            <Card title="Floating Disclosure">
              <div className="flex min-h-[240px] items-center justify-center">
                <FloatingDisclosure items={floatingItems} />
              </div>
            </Card>
            <Card title="Expandable Cards">
              <div className="h-[300px]">
                <ExpandableCards
                  cards={[
                    {
                      id: 1,
                      content: (
                        <div className="flex h-full flex-col justify-end bg-linear-to-br from-cyan-300/70 via-sky-300/30 to-slate-950 p-6 text-slate-950">
                          <p className="text-xs uppercase tracking-[0.28em]">Codex</p>
                          <h3 className="mt-3 text-2xl font-semibold">Review Summary</h3>
                        </div>
                      ),
                    },
                    {
                      id: 2,
                      content: (
                        <div className="flex h-full flex-col justify-end bg-linear-to-br from-pink-300/70 via-rose-300/30 to-slate-950 p-6 text-slate-950">
                          <p className="text-xs uppercase tracking-[0.28em]">Copilot</p>
                          <h3 className="mt-3 text-2xl font-semibold">Draft Threads</h3>
                        </div>
                      ),
                    },
                    {
                      id: 3,
                      content: (
                        <div className="flex h-full flex-col justify-end bg-linear-to-br from-amber-300/70 via-orange-300/30 to-slate-950 p-6 text-slate-950">
                          <p className="text-xs uppercase tracking-[0.28em]">Human</p>
                          <h3 className="mt-3 text-2xl font-semibold">Decision</h3>
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
            </Card>
            <Card title="Folder Tree">
              <FolderTree.Root defaultExpanded={['review', 'generated']} defaultSelected="summary">
                <FolderTree.Item id="review" label="review-gateway">
                  <FolderTree.Content>
                    <FolderTree.Item id="summary" label="overview-draft.ts" modified />
                    <FolderTree.Item id="reply" label="thread-reply.ts" badge="2" />
                  </FolderTree.Content>
                </FolderTree.Item>
                <FolderTree.Item id="generated" label="generated-drafts">
                  <FolderTree.Content>
                    <FolderTree.Item id="inline" label="inline-comments.json" untracked />
                    <FolderTree.Item id="summary-md" label="summary.md" />
                  </FolderTree.Content>
                </FolderTree.Item>
              </FolderTree.Root>
            </Card>
            <Card title="Glass">
              <div className="relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-[1.6rem] bg-linear-to-br from-cyan-300/20 via-white/5 to-pink-300/12">
                <Glass width="min(100%, 320px)" height={170} className="p-6">
                  <div className="flex h-full flex-col justify-between">
                    <p className="text-xs uppercase tracking-[0.28em] text-slate-900/60">
                      reviewer note
                    </p>
                    <h3 className="text-2xl font-semibold text-slate-950">
                      Reply candidate approved
                    </h3>
                    <p className="text-sm leading-7 text-slate-800/80">
                      draft thread をそのまま PR コメントへ昇格できます。
                    </p>
                  </div>
                </Glass>
              </div>
            </Card>
            <Card title="Thought Chain">
              <ThoughtChain>
                <ThoughtChainStep status="done">
                  <ThoughtChainTrigger>Diff chunks ingested</ThoughtChainTrigger>
                  <ThoughtChainContent>
                    <ThoughtChainItem>changed files: 12</ThoughtChainItem>
                    <ThoughtChainItem>thread anchors resolved</ThoughtChainItem>
                  </ThoughtChainContent>
                </ThoughtChainStep>
                <ThoughtChainStep status="active">
                  <ThoughtChainTrigger>Generate review hints</ThoughtChainTrigger>
                  <ThoughtChainContent>
                    <ThoughtChainItem>structured response を整形中</ThoughtChainItem>
                    <ThoughtChainItem>summary と inline を統合中</ThoughtChainItem>
                  </ThoughtChainContent>
                </ThoughtChainStep>
                <ThoughtChainStep status="pending" defaultOpen={false}>
                  <ThoughtChainTrigger>Post draft threads</ThoughtChainTrigger>
                  <ThoughtChainContent>
                    <ThoughtChainItem>採用された指摘だけを thread 化</ThoughtChainItem>
                  </ThoughtChainContent>
                </ThoughtChainStep>
              </ThoughtChain>
            </Card>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <Card title="Scroll X Carousel">
              <ScrollXCarousel className="h-[360px]">
                <ScrollXCarouselContainer className="h-[320px]">
                  <ScrollXCarouselWrap className="flex gap-5" xRagnge={['0%', '-56%']}>
                    {['Structured summary', 'Draft replies', 'Risk checklist', 'Launch notes'].map(
                      (item, index) => (
                        <div
                          key={item}
                          className={`flex h-[280px] w-[320px] shrink-0 flex-col justify-end rounded-[2rem] p-6 text-slate-950 shadow-[0_20px_50px_rgba(2,8,23,0.24)] ${['bg-linear-to-br from-cyan-300/70 via-sky-300/30 to-slate-950', 'bg-linear-to-br from-pink-300/70 via-rose-300/30 to-slate-950', 'bg-linear-to-br from-amber-300/70 via-orange-300/30 to-slate-950', 'bg-linear-to-br from-emerald-300/70 via-lime-300/30 to-slate-950'][index]}`}
                        >
                          <p className="text-xs uppercase tracking-[0.28em]">horizontal state</p>
                          <h3 className="mt-3 text-2xl font-semibold">{item}</h3>
                        </div>
                      ),
                    )}
                  </ScrollXCarouselWrap>
                </ScrollXCarouselContainer>
                <ScrollXCarouselProgress
                  className="mt-8 h-1 rounded-full bg-white/10"
                  progressStyle="h-full rounded-full bg-linear-to-r from-cyan-300 via-white to-pink-300"
                />
              </ScrollXCarousel>
            </Card>
            <Card title="MacOS Sidebar">
              <MacOSSidebar
                items={['Inbox', 'Summaries', 'Draft Threads', 'Playground']}
                className="min-h-[360px]"
              >
                <div className="grid gap-4">
                  <div className="rounded-[1.4rem] border border-white/10 bg-black/25 p-5">
                    <h3 className="text-2xl font-semibold text-white">Draft Threads</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-300">
                      PR comment 化待ちの候補を thread 単位で保持します。
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[1.2rem] border border-white/10 bg-white/6 p-4">
                      <p className="text-sm text-slate-400">Pending</p>
                      <p className="mt-2 text-3xl font-semibold text-white">04</p>
                    </div>
                    <div className="rounded-[1.2rem] border border-white/10 bg-white/6 p-4">
                      <p className="text-sm text-slate-400">Accepted</p>
                      <p className="mt-2 text-3xl font-semibold text-white">09</p>
                    </div>
                  </div>
                </div>
              </MacOSSidebar>
            </Card>
          </section>

          <section className="mt-8 rounded-[1.8rem] border border-white/10 bg-black/20 p-5">
            <div className="flex flex-wrap gap-3">
              {[
                ['none', 'Overlay Off'],
                ['flex', 'Flex Navbar'],
                ['dock', 'Expandable Dock'],
                ['magic', 'Magic Dock'],
                ['island', 'Scroll Island'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setOverlay(id as OverlayDemo)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${overlay === id ? 'border-cyan-200/30 bg-cyan-300 text-slate-950' : 'border-white/12 bg-white/6 text-white hover:bg-white/10'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {overlay === 'island' ? (
              <div className="mt-6 overflow-hidden rounded-[1.6rem] border border-white/10 bg-white p-2 text-slate-950">
                <ScrollIsland topics={topics} />
              </div>
            ) : (
              <p className="mt-6 text-sm leading-7 text-slate-400">
                {overlay === 'none'
                  ? 'overlay demo は現在オフです。'
                  : `${overlay} を有効化しました。固定配置でページに重なります。`}
              </p>
            )}
          </section>

          {overlay === 'flex' ? (
            <FlexNavbar
              brandName="THREAD APP"
              tagline="Review assistant surfaces"
              launchText="PoC wave 2"
              navLinks={[
                { label: 'Overview', href: '#overview' },
                { label: 'Threads', href: '#threads' },
                { label: 'Diff', href: '#diff' },
                { label: 'Docs', href: '#docs' },
              ]}
              media={{
                type: 'image',
                src: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1200&q=80',
                alt: 'Review dashboard',
                link: 'https://github.com',
              }}
              mediaButtonText="Open reference"
              showThemeToggle={false}
            />
          ) : null}
          {overlay === 'dock' ? (
            <ExpandableDock
              headerContent={
                <div className="flex w-full items-center justify-between text-white">
                  <div>
                    <p className="text-xs uppercase tracking-[0.26em] text-slate-400">dock</p>
                    <p className="mt-1 text-sm font-semibold">Review Actions</p>
                  </div>
                  <span>+</span>
                </div>
              }
            >
              <div className="flex min-w-max gap-4">
                {['Run Codex', 'Compare Copilot', 'Promote Threads', 'Open Docs'].map((item) => (
                  <div
                    key={item}
                    className="w-[220px] shrink-0 rounded-[1.4rem] border border-white/10 bg-white/6 p-5 text-white"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </ExpandableDock>
          ) : null}
          {overlay === 'magic' ? (
            <MagicDock items={dockItems} variant="tooltip" className="z-[60]" />
          ) : null}
        </main>
      </AuroraBackground>
    </React.Fragment>
  );
}
