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
import { VanishInput } from '../components/ui/vanish-input';
import { ActivitiesCard } from '../components/ui/activities-card';
import { CommitGraph, type Commit } from '../components/commit-graph';
import { CommandSearch, type CommandItem } from '../components/ui/command-search';
import { CreateNewDisclosure } from '../components/ui/create-new-disclosure';
import ExpandableCards from '../components/ui/expandable-cards';
import ExpandableDock from '../components/ui/expandable-dock';
import { AnimatedProfileMenu } from '../components/ui/animated-profile-menu';
import { FeedbackComponent } from '../components/ui/feedback';
import { FlexNavbar } from '../components/ui/flex-navbar';
import { FloatingDisclosure, items as floatingItems } from '../components/ui/floating-disclosure';
import FolderTree from '../components/ui/folder-tree';
import { Glass } from '../components/ui/glass';
import { ListStack } from '../components/ui/list-stack';
import { MacOSSidebar } from '../components/ui/macos-sidebar';
import MagicDock, { type DockItemData } from '../components/ui/magicdock';
import MorphingText from '../components/ui/morphing-text';
import {
  MorphingDialog,
  MorphingDialogClose,
  MorphingDialogContainer,
  MorphingDialogContent,
  MorphingDialogDescription,
  MorphingDialogTitle,
  MorphingDialogTrigger,
} from '../components/motion-primitives/morphing-dialog';
import { CommentThread } from '../components/ui/comment-thread';
import { ScrollIsland, type Topic } from '../components/ui/scroll-island';
import {
  NativeMorphingButton,
  type MorphingButtonAction,
} from '../components/uitripled/native-morphing-button-shadcnui';
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
import { AnimatedCurvedTimeline } from '../components/ui/animated-curved-timeline';

type OverlayDemo = 'none' | 'flex' | 'dock' | 'magic' | 'island';

const morphingLabels = ['Review Radar', 'Thread Fusion', 'Patch Queue', 'Launch Gate'];

const previewCommits: Commit[] = [
  {
    hash: '9f8c1d2',
    message: 'review: persist accepted findings',
    author: { name: 'Codex' },
    date: '2026-04-10T09:30:00+09:00',
    parents: ['7ad4e88'],
    refs: ['feature/review-ui'],
  },
  {
    hash: '7ad4e88',
    message: 'ui: add thread inbox counters',
    author: { name: 'GitHub Copilot' },
    date: '2026-04-09T18:15:00+09:00',
    parents: ['6bc219a'],
    refs: ['HEAD'],
  },
  {
    hash: '6bc219a',
    message: 'merge branch main into feature/review-ui',
    author: { name: 'nkubo' },
    date: '2026-04-09T12:05:00+09:00',
    parents: ['2ab4f31', '5ee718c'],
    tag: 'v0.2.0-preview',
  },
  {
    hash: '5ee718c',
    message: 'main: stabilize diff gateway state',
    author: { name: 'nkubo' },
    date: '2026-04-08T17:20:00+09:00',
    parents: ['4a7c2de'],
    refs: ['main'],
  },
  {
    hash: '2ab4f31',
    message: 'feat: stage review thread promotions',
    author: { name: 'Codex' },
    date: '2026-04-08T09:10:00+09:00',
    parents: ['4a7c2de'],
  },
  {
    hash: '4a7c2de',
    message: 'init: seed review assistant playground',
    author: { name: 'nkubo' },
    date: '2026-04-07T14:00:00+09:00',
    parents: [],
  },
];

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
    <section className={`fey-panel rounded-lg p-5 ${className}`}>
      <p className="mb-4 text-xs uppercase text-[#FFA16C]/75">{title}</p>
      {children}
    </section>
  );
}

export default function UiComponentPage() {
  const [prompt, setPrompt] = React.useState(
    '第三陣コンポーネントを review-assistant UI に接続する。',
  );
  const [overlay, setOverlay] = React.useState<OverlayDemo>('none');
  const [morphingIndex, setMorphingIndex] = React.useState(0);

  React.useEffect(() => {
    const timerId = window.setInterval(() => {
      setMorphingIndex((current) => (current + 1) % morphingLabels.length);
    }, 2200);

    return () => window.clearInterval(timerId);
  }, []);

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

  const morphingActions = React.useMemo<MorphingButtonAction[]>(
    () => [
      {
        label: 'Run Codex',
        icon: <Bot className="h-4 w-4" />,
        onClick: () => setPrompt('Codex に review summary を再生成させる。'),
      },
      {
        label: 'Open Diff',
        icon: <FileCode2 className="h-4 w-4" />,
        onClick: () => setPrompt('差分ビューを右ペインで開く。'),
      },
      {
        label: 'Promote Thread',
        icon: <MessageSquareMore className="h-4 w-4" />,
        onClick: () => setPrompt('採用済みコメントを PR thread に昇格する。'),
      },
    ],
    [],
  );

  const dockItems: DockItemData[] = [
    {
      id: 1,
      icon: <Bot className="h-5 w-5 text-[#479FFA]" />,
      label: 'Codex',
      description: 'Run',
      onClick: () => setPrompt('Codex を再実行する。'),
    },
    {
      id: 2,
      icon: <Command className="h-5 w-5 text-[#FFA16C]" />,
      label: 'Palette',
      description: 'Open',
      onClick: () => setPrompt('command palette を開く。'),
    },
    {
      id: 3,
      icon: <FolderGit2 className="h-5 w-5 text-[#4EBE96]" />,
      label: 'Tree',
      description: 'Files',
      onClick: () => setPrompt('folder tree を同期する。'),
    },
    {
      id: 4,
      icon: <SendHorizontal className="h-5 w-5 text-[#FF5C5C]" />,
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
        <title>Coding Agent Thread App | UI Component Wave 4</title>
      </Head>
      <AuroraBackground className="min-h-screen">
        <main className="mx-auto flex min-h-screen w-full max-w-[96rem] flex-col px-5 py-10 sm:px-8">
          <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-5">
              <p className="fey-chip inline-flex rounded-lg px-4 py-3 text-xs font-semibold uppercase text-[#FFA16C]">
                Review Interface System
              </p>
              <h1 className="fey-display text-5xl font-semibold text-white/90 sm:text-6xl">
                Fey-grade Review Console
              </h1>
              <ShimmerText
                text="Deep black, high-density, glass-lined surfaces for agent review workflows"
                className="block max-w-3xl text-lg leading-8 sm:text-xl"
              />
              <p className="max-w-3xl text-base leading-8 text-[#868F97]">
                レビュー支援 UI を黒基調の金融端末として再構成します。差分、thread、 agent action
                を同じ濃度の surface に載せ、意味色だけを控えめに残します。
              </p>
              <VanishInput
                placeholders={[
                  'commit graph を PR 詳細ペインに埋め込む',
                  'morphing button から agent action を開く',
                  'dock や navbar の見せ方を詰める',
                  'thought chain を review summary に埋め込む',
                ]}
                onSubmit={setPrompt}
                className="max-w-3xl"
              />
            </div>
            <Card title="Prompt State">
              <div className="space-y-4">
                <div className="rounded-lg border border-white/[0.08] bg-white/[0.055] px-5 py-4 text-sm leading-7 text-white/88">
                  {prompt}
                </div>
                <ul className="space-y-2 text-sm leading-7 text-[#868F97]">
                  <li>深い黒、1px 境界、blur surface を共通の視覚言語にします。</li>
                  <li>成長は green、risk は red、action は blue、注目は orange に限定します。</li>
                  <li>固定 overlay は selector から個別に有効化します。</li>
                </ul>
              </div>
            </Card>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <div className="space-y-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#FFA16C]">fourth wave</p>
              <CommentThread />
            </div>
            <div className="space-y-6">
              <div className="rounded-lg border border-white/[0.12] bg-[linear-gradient(176.83deg,#141414_24.95%,#0b0b0b_50.08%,#030303_88.5%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <p className="text-xs uppercase tracking-[0.18em] text-[#FFA16C]">
                  animated profile menu
                </p>
                <div className="mt-4 flex justify-start">
                  <AnimatedProfileMenu />
                </div>
                <p className="mt-4 text-sm leading-7 text-[#868F97]">
                  アカウントと通知の入り口を、黒基調の浮遊メニューとしてまとめています。
                </p>
              </div>

              <div className="rounded-lg border border-white/[0.12] bg-[linear-gradient(176.83deg,#141414_24.95%,#0b0b0b_50.08%,#030303_88.5%)] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <p className="text-xs uppercase tracking-[0.18em] text-[#FFA16C]">
                  morphing dialog
                </p>
                <MorphingDialog>
                  <div className="mt-4">
                    <MorphingDialogTrigger className="w-full">
                      <div className="flex items-center justify-between rounded-lg border border-white/[0.12] bg-white/[0.06] px-4 py-3 text-left transition hover:bg-white/[0.08]">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">Open review gate</p>
                          <p className="mt-1 text-xs text-[#868F97]">
                            summary / diff / action / status
                          </p>
                        </div>
                        <span className="rounded-lg border border-[#FFA16C]/30 bg-[#FFA16C] px-2.5 py-1 text-xs font-semibold text-black">
                          Open
                        </span>
                      </div>
                    </MorphingDialogTrigger>
                  </div>
                  <MorphingDialogContainer>
                    <MorphingDialogContent className="w-[min(92vw,760px)]">
                      <div className="relative p-5 sm:p-6">
                        <MorphingDialogClose />
                        <MorphingDialogTitle className="pr-10 text-2xl font-semibold text-white">
                          Review Gate
                        </MorphingDialogTitle>
                        <MorphingDialogDescription className="mt-2 text-sm leading-7 text-[#868F97]">
                          thread summary と agent action を 1 枚に集約して、切り替えを短くします。
                        </MorphingDialogDescription>
                        <div className="mt-5 grid gap-4 sm:grid-cols-3">
                          <div className="rounded-lg border border-white/[0.08] bg-white/[0.05] p-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[#FFA16C]">
                              summary
                            </p>
                            <p className="mt-3 text-sm leading-7 text-[#d7d7d7]">
                              変更点を短くまとめ、レビューの入口だけを残します。
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/[0.08] bg-white/[0.05] p-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[#479FFA]">
                              actions
                            </p>
                            <p className="mt-3 text-sm leading-7 text-[#d7d7d7]">
                              Codex / Copilot / human のアクションを同じ深さに揃えます。
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/[0.08] bg-white/[0.05] p-4">
                            <p className="text-[11px] uppercase tracking-[0.14em] text-[#4EBE96]">
                              status
                            </p>
                            <p className="mt-3 text-sm leading-7 text-[#d7d7d7]">
                              accept, revise, follow-up の三択を明確にします。
                            </p>
                          </div>
                        </div>
                      </div>
                    </MorphingDialogContent>
                  </MorphingDialogContainer>
                </MorphingDialog>
              </div>
            </div>
          </section>

          <section className="mt-8 grid gap-6 xl:grid-cols-[0.85fr_1.3fr_0.85fr]">
            <Card title="Morphing Text">
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  {morphingLabels.map((label, index) => (
                    <span
                      key={label}
                      className={`rounded-lg px-3 py-2 text-[11px] font-semibold uppercase ${
                        morphingIndex === index
                          ? 'bg-[#FFA16C] text-black'
                          : 'border border-white/[0.08] bg-white/[0.055] text-[#868F97]'
                      }`}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div className="min-h-[96px]">
                  <MorphingText as="h2" className="text-4xl font-semibold text-white sm:text-5xl">
                    {morphingLabels[morphingIndex]}
                  </MorphingText>
                </div>
                <p className="text-sm leading-7 text-[#868F97]">
                  差し替える文字列だけで状態名の見せ方を切り替えられるので、 review-assistant の
                  phase ラベルや agent status にそのまま転用できます。
                </p>
              </div>
            </Card>
            <Card title="Commit Graph">
              <CommitGraph
                commits={previewCommits}
                className="border-white/[0.08] bg-black/45 text-white"
              />
            </Card>
            <Card title="Native Morphing Button">
              <div className="relative min-h-[300px] overflow-hidden rounded-lg border border-white/[0.08] bg-[linear-gradient(176.83deg,#131313_24.95%,#0C0C0C_50.08%,#030303_88.5%)] p-6">
                <div className="pointer-events-none absolute bottom-0 right-0 h-32 w-56 opacity-35">
                  <div className="absolute bottom-5 right-8 grid grid-cols-7 gap-1.5">
                    {Array.from({ length: 28 }).map((_, index) => (
                      <span
                        key={index}
                        className="h-1.5 w-5 rounded-[2px] bg-white/[0.16] shadow-[0_0_12px_rgba(255,255,255,0.22)]"
                      />
                    ))}
                  </div>
                  <div className="absolute bottom-0 right-0 h-20 w-56 bg-[radial-gradient(ellipse_at_bottom_right,rgba(255,161,108,0.22),transparent_62%)]" />
                </div>
                <div className="max-w-[16rem] space-y-3">
                  <p className="text-xs uppercase text-[#FFA16C]/70">quick actions</p>
                  <h3 className="text-3xl font-semibold text-white">Review Desk</h3>
                  <p className="text-sm leading-7 text-[#868F97]">
                    FAB を展開して Codex 実行、Diff 表示、Thread 昇格を即時に切り替える想定です。
                  </p>
                </div>
                <NativeMorphingButton actions={morphingActions} className="bottom-5 right-5" />
              </div>
            </Card>
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-3">
            <Card title="Activities Card">
              <div className="flex justify-center">
                <ActivitiesCard
                  headerIcon={<Activity className="h-6 w-6 text-[#FFA16C]" />}
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
                        <div className="flex h-full flex-col justify-end bg-[linear-gradient(176.83deg,#242424_24.95%,#111_55%,#030303_88.5%)] p-6 text-white">
                          <p className="text-xs uppercase text-[#479FFA]">Codex</p>
                          <h3 className="mt-3 text-2xl font-semibold">Review Summary</h3>
                        </div>
                      ),
                    },
                    {
                      id: 2,
                      content: (
                        <div className="flex h-full flex-col justify-end bg-[linear-gradient(176.83deg,#211411_24.95%,#120C0A_55%,#030303_88.5%)] p-6 text-white">
                          <p className="text-xs uppercase text-[#FFA16C]">Copilot</p>
                          <h3 className="mt-3 text-2xl font-semibold">Draft Threads</h3>
                        </div>
                      ),
                    },
                    {
                      id: 3,
                      content: (
                        <div className="flex h-full flex-col justify-end bg-[linear-gradient(176.83deg,#11201A_24.95%,#0B130F_55%,#030303_88.5%)] p-6 text-white">
                          <p className="text-xs uppercase text-[#4EBE96]">Human</p>
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
              <div className="relative flex min-h-[240px] items-center justify-center overflow-hidden rounded-lg border border-white/[0.08] bg-black">
                <div className="pointer-events-none absolute inset-0 opacity-[0.14] [background-image:radial-gradient(circle_at_17%_23%,rgba(255,255,255,0.16)_0_0.7px,transparent_0.9px),radial-gradient(circle_at_73%_41%,rgba(255,255,255,0.12)_0_0.6px,transparent_0.85px),radial-gradient(circle_at_43%_79%,rgba(255,255,255,0.1)_0_0.55px,transparent_0.8px)] [background-size:19px_19px,23px_23px,29px_29px] [mix-blend-mode:screen]" />
                <Glass width="min(100%, 320px)" height={170} className="p-6">
                  <div className="flex h-full flex-col justify-between">
                    <p className="text-xs uppercase text-black/60">reviewer note</p>
                    <h3 className="text-2xl font-semibold text-black">Reply candidate approved</h3>
                    <p className="text-sm leading-7 text-black/70">
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

          <section className="mt-6">
            <Card title="Animated Curved Timeline">
              <div className="h-[560px]">
                <AnimatedCurvedTimeline />
              </div>
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
                          className={`flex h-[280px] w-[320px] shrink-0 flex-col justify-end rounded-lg border border-white/[0.08] p-6 text-white ${['bg-[linear-gradient(176.83deg,#171717_24.95%,#0C0C0C_50.08%,#030303_88.5%)]', 'bg-[linear-gradient(176.83deg,#1A120E_24.95%,#0F0B08_50.08%,#030303_88.5%)]', 'bg-[linear-gradient(176.83deg,#1A0E0E_24.95%,#100707_50.08%,#030303_88.5%)]', 'bg-[linear-gradient(176.83deg,#0F1B16_24.95%,#09110D_50.08%,#030303_88.5%)]'][index]}`}
                        >
                          <p className="text-xs uppercase text-[#FFA16C]">horizontal state</p>
                          <h3 className="mt-3 text-2xl font-semibold">{item}</h3>
                        </div>
                      ),
                    )}
                  </ScrollXCarouselWrap>
                </ScrollXCarouselContainer>
                <ScrollXCarouselProgress
                  className="mt-8 h-1 rounded-lg bg-white/10"
                  progressStyle="h-full rounded-lg bg-[#FFA16C]"
                />
              </ScrollXCarousel>
            </Card>
            <Card title="MacOS Sidebar">
              <MacOSSidebar
                items={['Inbox', 'Summaries', 'Draft Threads', 'Playground']}
                className="min-h-[360px]"
              >
                <div className="grid gap-4">
                  <div className="rounded-lg border border-white/[0.08] bg-black/35 p-5">
                    <h3 className="text-2xl font-semibold text-white">Draft Threads</h3>
                    <p className="mt-3 text-sm leading-7 text-[#868F97]">
                      PR comment 化待ちの候補を thread 単位で保持します。
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.055] p-4">
                      <p className="text-sm text-[#868F97]">Pending</p>
                      <p className="mt-2 text-3xl font-semibold text-white">04</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.08] bg-white/[0.055] p-4">
                      <p className="text-sm text-[#868F97]">Accepted</p>
                      <p className="mt-2 text-3xl font-semibold text-white">09</p>
                    </div>
                  </div>
                </div>
              </MacOSSidebar>
            </Card>
          </section>

          <section className="fey-panel mt-8 rounded-lg p-5">
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
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${overlay === id ? 'border-[#FFA16C]/40 bg-[#FFA16C] text-black' : 'border-white/[0.08] bg-white/[0.055] text-white hover:bg-white/[0.08]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {overlay === 'island' ? (
              <div className="mt-6 overflow-hidden rounded-lg border border-white/[0.08] bg-white p-2 text-black">
                <ScrollIsland topics={topics} />
              </div>
            ) : (
              <p className="mt-6 text-sm leading-7 text-[#868F97]">
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
              launchText="PoC wave 3"
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
                    <p className="text-xs uppercase text-[#FFA16C]">dock</p>
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
                    className="w-[220px] shrink-0 rounded-lg border border-white/[0.08] bg-white/[0.055] p-5 text-white"
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
