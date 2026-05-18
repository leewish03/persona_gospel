import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Home,
  Settings,
  Shield
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAppController } from "@/hooks/useAppController";
import {
  goalText,
  personaImages,
  relationshipText,
  screenMeta,
  settingImages,
  settingText
} from "@/lib/constants";
import { formatCount, formatDate, formatKrw, formatPercent, markdownToHtml, percentOf, sessionLabels, usageEventLabel } from "@/lib/format";
import { cn } from "@/lib/utils";

function SelectControl({ id, label, value, onChange, placeholder, options, disabled }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function AppShell({ state, actions, children }) {
  const meta = screenMeta[state.currentScreen] || screenMeta.home;
  const isHome = state.currentScreen === "home";
  const actionless = ["login", "history", "historyDetail", "settings", "admin"].includes(state.currentScreen);
  const primaryLabel = state.currentScreen === "review" && !state.reviewConfirmed ? "내용 확인" : meta.action;
  const showBottom = !isHome && !actionless && !(state.currentScreen === "chat" && state.sessionStarted);
  const showTabs = state.hasUser && state.profileComplete && !["login", "profile"].includes(state.currentScreen);
  const chatUserTurns = state.messages.filter((m) => m.role === "user").length;
  const canFeedbackFromChat = chatUserTurns > 0 && !state.isBusy && state.sessionStarted;
  const headerTrailingChat = state.currentScreen === "chat" && state.sessionStarted;

  useEffect(() => {
    const root = document.documentElement;
    const vv = window.visualViewport;
    const sync = () => {
      const height = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--app-vvh", `${Math.max(1, Math.round(height))}px`);
      if (vv) {
        const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        root.style.setProperty("--keyboard-inset", `${inset}px`);
      } else {
        root.style.setProperty("--keyboard-inset", "0px");
      }
    };
    sync();
    if (!vv) {
      window.addEventListener("resize", sync);
      return () => window.removeEventListener("resize", sync);
    }
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  return (
    <>
      <div className="relative mx-auto h-[var(--app-vvh)] max-h-[var(--app-vvh)] w-full max-w-[480px] overflow-hidden bg-background shadow-2xl ring-1 ring-border/60">
        {isHome ? (
          <main className="flex h-full min-h-0 flex-col overflow-hidden">{children}</main>
        ) : (
          <main className={cn("flex h-full min-h-0 flex-col overflow-hidden", showTabs && "pb-[calc(4.25rem+env(safe-area-inset-bottom))]")}>
            <header className="grid shrink-0 grid-cols-[44px_minmax(0,1fr)_minmax(0,auto)] items-center gap-2 border-b bg-card/80 px-4 pb-3 pt-4 backdrop-blur">
              <Button
                variant="ghost"
                size="icon"
                aria-label="이전 단계"
                className="rounded-full disabled:bg-muted disabled:text-muted-foreground"
                disabled={state.isBusy || (state.currentScreen === "chat" && state.sessionStarted)}
                onClick={actions.previousScreen}
              >
                <ChevronLeft />
              </Button>
              <div className="min-w-0 text-center">
                <p className="text-xs font-black uppercase text-primary">{meta.eyebrow}</p>
                <h1 className="truncate text-base font-black">{meta.title}</h1>
              </div>
              {headerTrailingChat ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="max-w-[5.5rem] shrink-0 rounded-full px-2 text-xs font-black disabled:bg-muted disabled:text-muted-foreground"
                  disabled={!canFeedbackFromChat}
                  onClick={actions.finishSession}
                >
                  피드백
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-full font-black disabled:bg-muted disabled:text-muted-foreground"
                  disabled={state.isBusy}
                  onClick={actions.resetAll}
                >
                  처음
                </Button>
              )}
            </header>
            <Progress value={state.setupProgress} className="mx-4 h-1 w-auto shrink-0" />
            <section className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4">{children}</section>
            {state.currentScreen === "chat" ? <ChatComposer state={state} actions={actions} /> : null}
            {showBottom ? (
              <footer className={cn("grid shrink-0 gap-2 border-t bg-card/95 p-4 shadow-[0_-12px_32px_rgba(23,33,31,0.08)]", meta.secondary && "grid-cols-2")}>
                <Button disabled={state.isBusy || (state.currentScreen === "review" && !state.reviewConfirmed && false)} onClick={actions.handlePrimaryAction}>
                  {primaryLabel}
                </Button>
                {meta.secondary ? (
                  <Button variant="secondary" disabled={state.isBusy} onClick={actions.handleSecondaryAction}>
                    {meta.secondary}
                  </Button>
                ) : null}
              </footer>
            ) : null}
          </main>
        )}
        {showTabs ? <TabBar state={state} actions={actions} /> : null}
      </div>
      <PendingActionDialog state={state} actions={actions} />
    </>
  );
}

function PendingActionDialog({ state, actions }) {
  const pending = state.pendingDialog;
  const copy = {
    navigation: {
      title: "대화 화면을 잠시 벗어날까요?",
      description: "대화가 바로 끊기지는 않습니다. 지금까지의 흐름은 유지되며, 하단의 훈련 탭을 누르면 다시 채팅으로 돌아올 수 있습니다.",
      action: "이동하기"
    },
    reset: {
      title: "처음으로 돌아갈까요?",
      description: "현재 화면의 진행 상태를 초기화하고 홈으로 돌아갑니다. 저장된 훈련 기록은 그대로 남습니다.",
      action: "처음으로"
    },
    feedback: {
      title: "피드백을 받을까요?",
      description: "피드백을 생성하면 이 훈련 대화가 종료되고 리포트 화면으로 이동합니다.",
      action: "피드백 받기"
    }
  }[pending?.type || "navigation"];

  return (
    <AlertDialog open={Boolean(pending)} onOpenChange={(open) => !open && actions.cancelPendingDialog()}>
      <AlertDialogContent size="sm" className="max-w-[calc(100vw-2rem)] rounded-3xl">
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={actions.cancelPendingDialog}>취소</AlertDialogCancel>
          <AlertDialogAction onClick={actions.confirmPendingDialog}>{copy.action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TabBar({ state, actions }) {
  const tabs = [
    { key: "home", label: "훈련", icon: Home },
    { key: "history", label: "기록", icon: BookOpen },
    { key: "settings", label: "설정", icon: Settings },
    ...(state.isAdmin ? [{ key: "admin", label: "관리", icon: Shield }] : [])
  ];
  return (
    <nav
      className="fixed left-1/2 z-40 grid w-full max-w-[480px] -translate-x-1/2 auto-cols-fr grid-flow-col gap-2 border-t bg-card/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem))] pt-2 shadow-[0_-10px_24px_rgba(23,33,31,0.08)] backdrop-blur"
      style={{ bottom: "var(--keyboard-inset, 0px)" }}
      aria-label="하단 내비게이션"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.key === state.currentScreen || (tab.key === "home" && ["persona", "context", "review", "chat", "feedback"].includes(state.currentScreen));
        return (
          <Button
            key={tab.key}
            type="button"
            variant={active ? "secondary" : "ghost"}
            className={cn("h-14 flex-col gap-1 rounded-2xl text-xs font-black", active && "border border-primary/20 bg-primary text-primary-foreground shadow-sm hover:bg-primary/90")}
            disabled={state.isBusy}
            onClick={() => {
              if (tab.key === "home") {
                if (active && state.sessionStarted && state.currentScreen === "chat") {
                  actions.resetAll();
                  return;
                }
                if (state.sessionStarted) {
                  actions.goTo("chat");
                  return;
                }
              }
              actions.goTo(tab.key);
            }}
          >
            <Icon />
            {tab.label}
          </Button>
        );
      })}
    </nav>
  );
}

function HomeScreen({ state, actions }) {
  const cta = !state.hasUser ? "로그인하고 시작" : state.profileComplete ? "훈련 시작" : "프로필 입력";
  return (
    <div className="relative h-full overflow-hidden bg-stone-950">
      <img className="absolute inset-0 size-full select-none object-cover object-center" draggable="false" src="/assets/home-cover.jpg" alt="카페에서 진지하게 대화하는 두 사람" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/20 to-black/75" />
      <div className="absolute inset-x-0 top-0 z-10 px-5 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <p className="text-xs font-black uppercase tracking-wide text-white/80">Witness Lab</p>
        <h1 className="mt-1 text-lg font-black">복음 대화 훈련소</h1>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-10 grid gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] text-white">
        <div>
          <Badge variant="secondary" className="mb-3 bg-white/90 text-stone-900">Mobile Training</Badge>
          <h2 className="text-[clamp(1.65rem,8vw,2.6rem)] font-black leading-tight">복음을 전하는 대화,<br />먼저 연습하세요</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-white/85">실제 대화 전에 안전하게 연습하고, 끝나면 피드백 리포트를 확인하세요.</p>
          {state.hasUser ? <p className="mt-3 text-xs font-semibold text-white/70">{state.auth.user.profile?.name || state.auth.user.displayName}님, 이어서 훈련할 수 있습니다.</p> : null}
        </div>
        <Button className="h-12 rounded-full bg-primary text-base font-black shadow-2xl hover:bg-primary/90" onClick={actions.handlePrimaryAction}>
          {cta}
        </Button>
      </div>
    </div>
  );
}

function LoginScreen({ state, actions }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>로그인</CardTitle>
        <CardDescription>훈련 기록과 피드백을 계정에 저장하려면 먼저 로그인해야 합니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button asChild variant="outline"><a href="/auth/google">Google로 계속하기</a></Button>
        <Button asChild variant="secondary"><a href="/auth/kakao">카카오로 계속하기</a></Button>
        {state.auth.devLoginEnabled ? <Button onClick={actions.devLogin}>개발용 로그인</Button> : null}
        {state.errors.auth ? <Alert variant="destructive"><AlertCircle /><AlertTitle>로그인 실패</AlertTitle><AlertDescription>{state.errors.auth}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}

function ProfileScreen({ state, actions }) {
  const update = (patch) => actions.setProfileForm((value) => ({ ...value, ...patch }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>기본 정보 입력</CardTitle>
        <CardDescription>무분별한 사용을 줄이고 개인 훈련 기록을 구분하기 위한 최소 정보입니다.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2"><Label htmlFor="profile-name">이름</Label><Input id="profile-name" value={state.profileForm.name} onChange={(event) => update({ name: event.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="profile-age">나이</Label><Input id="profile-age" type="number" min="10" max="99" value={state.profileForm.age} onChange={(event) => update({ age: event.target.value })} /></div>
        <SelectControl id="profile-gender" label="성별" value={state.profileForm.gender} onChange={(gender) => update({ gender })} placeholder="성별 선택" options={[{ value: "남성", label: "남성" }, { value: "여성", label: "여성" }]} />
        <div className="grid gap-2"><Label htmlFor="profile-church">소속 교회</Label><Input id="profile-church" value={state.profileForm.church} onChange={(event) => update({ church: event.target.value })} /></div>
        <div className="grid gap-2"><Label htmlFor="profile-use">사용 용도</Label><Input id="profile-use" value={state.profileForm.useCase} onChange={(event) => update({ useCase: event.target.value })} placeholder="CBF 활동 / 청년 활동 / 개인 전도 훈련" /></div>
        {state.errors.profile ? <Alert variant="destructive"><AlertCircle /><AlertTitle>입력 확인</AlertTitle><AlertDescription>{state.errors.profile}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}

function PersonaScreen({ state, actions }) {
  return (
    <div className="grid gap-3">
      {state.personas.map((persona) => (
        <button
          key={persona.id}
          type="button"
          className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-sm transition", state.selectedPersonaId === persona.id && "border-primary ring-2 ring-primary/20")}
          onClick={() => actions.setSelectedPersonaId(persona.id)}
        >
          <Avatar className="size-14 rounded-2xl">
            <AvatarImage src={personaImages[persona.id]} alt={persona.name} />
            <AvatarFallback>{persona.name.slice(0, 1)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <strong className="block truncate">{persona.name}</strong>
            <span className="block text-sm text-muted-foreground">{persona.title}</span>
          </span>
          {state.selectedPersonaId === persona.id ? <Badge className="ml-auto">선택</Badge> : null}
        </button>
      ))}
    </div>
  );
}

function ContextScreen({ state, actions }) {
  const update = (patch) => {
    actions.setContextForm((value) => ({ ...value, ...patch }));
    actions.setReviewConfirmed(false);
  };
  return (
    <div className="grid gap-4">
      {state.contextForm.setting ? <img className="aspect-[16/9] w-full rounded-2xl object-cover" src={settingImages[state.contextForm.setting]} alt="선택한 대화 상황" /> : null}
      <Card>
        <CardContent className="grid gap-4 pt-6">
          <SelectControl id="relationship" label="관계" value={state.contextForm.relationship} onChange={(relationship) => update({ relationship })} placeholder="관계 선택" options={Object.entries(relationshipText).map(([value, label]) => ({ value, label }))} />
          <SelectControl id="setting" label="상황" value={state.contextForm.setting} onChange={(setting) => update({ setting })} placeholder="상황 선택" options={Object.entries(settingText).map(([value, label]) => ({ value, label }))} />
          <SelectControl id="goal" label="훈련 초점" value={state.contextForm.goal} onChange={(goal) => update({ goal })} placeholder="훈련 초점 선택" options={Object.entries(goalText).map(([value, label]) => ({ value, label }))} />
          {state.errors.context ? <Alert variant="destructive"><AlertCircle /><AlertTitle>상황 설정 필요</AlertTitle><AlertDescription>{state.errors.context}</AlertDescription></Alert> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ReviewScreen({ state }) {
  const persona = state.currentPersona;
  const labels = sessionLabels(state.currentSession, state.personas);
  if (!persona) return null;
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>선택한 훈련</CardTitle>
          <CardDescription>아래 내용을 확인하고 한 번 더 누르면 시작합니다.</CardDescription>
          <CardAction>{state.reviewConfirmed ? <Badge><CheckCircle2 data-icon="inline-start" />확인됨</Badge> : <Badge variant="outline">확인 필요</Badge>}</CardAction>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p><b>페르소나</b> {labels.persona}</p>
          <p><b>관계</b> {labels.relationship}</p>
          <p><b>상황</b> {labels.setting}</p>
          <p><b>훈련 초점</b> {labels.goal}</p>
        </CardContent>
      </Card>
      <Card>
        <img className="aspect-video w-full rounded-t-xl object-cover" src={personaImages[persona.id]} alt={`${persona.name} 프로필`} />
        <CardHeader>
          <CardTitle>{persona.name}</CardTitle>
          <CardDescription>{persona.shortDescription}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <InfoList title="내면 갈등" items={persona.innerConflicts?.slice(0, 3)} />
          <div className="flex flex-wrap gap-2">{persona.gospelBarriers?.map((item) => <Badge key={item} variant="secondary">{item}</Badge>)}</div>
          <blockquote className="rounded-xl bg-muted p-3 text-sm">"{persona.sampleLines?.[0]}"</blockquote>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoList({ title, items = [] }) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-black text-primary">{title}</h3>
      <ul className="grid gap-1 text-sm text-muted-foreground">
        {items.map((item) => <li key={item}>• {item}</li>)}
      </ul>
    </div>
  );
}

function ChatScreen({ state }) {
  const listRef = useRef(null);
  const persona = state.currentPersona;
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [state.messages, state.waitingForAssistant]);
  return (
    <div ref={listRef} className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto overscroll-y-contain rounded-2xl bg-muted p-2">
      {state.messages.map((message, index) => (
        <MessageBubble key={`${message.role}-${index}`} message={message} persona={persona} />
      ))}
      {state.waitingForAssistant && persona ? (
        <MessageBubble message={{ role: "assistant", content: "응답을 작성하는 중..." }} persona={persona} typing />
      ) : null}
    </div>
  );
}

function MessageBubble({ message, persona, typing }) {
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";
  return (
    <article className={cn("grid max-w-[88%] gap-1", isAssistant && "grid-cols-[34px_minmax(0,1fr)] self-start", message.role === "user" && "self-end", isSystem && "self-center")}>
      {isAssistant ? (
        <Avatar className="row-span-2 size-8 rounded-xl">
          <AvatarImage src={personaImages[persona?.id]} alt={persona?.name || "페르소나"} />
          <AvatarFallback>{persona?.name?.slice(0, 1) || "AI"}</AvatarFallback>
        </Avatar>
      ) : null}
      {!isSystem ? <span className="px-1 text-xs font-black text-muted-foreground">{isAssistant ? persona?.name : "나"}</span> : null}
      <div className={cn("whitespace-pre-wrap rounded-2xl bg-background px-3 py-2 text-sm leading-6 shadow-sm", message.role === "user" && "rounded-br-md bg-yellow-300 text-stone-950", isAssistant && "rounded-bl-md", isSystem && "bg-amber-50 text-amber-900")}>
        {typing ? <span className="animate-pulse">{message.content}</span> : message.content}
      </div>
    </article>
  );
}

function ChatComposer({ state, actions }) {
  const [draft, setDraft] = useState("");
  const labels = sessionLabels(state.currentSession, state.personas);
  const goalHint = labels.goal?.trim();
  const canSend = draft.trim() && !state.isBusy && state.sessionStarted;
  const submit = (event) => {
    event.preventDefault();
    if (!canSend) return;
    void actions.submitMessage(draft);
    setDraft("");
  };
  return (
    <form className="grid shrink-0 grid-cols-[minmax(0,1fr)_68px] items-end gap-2 border-t bg-card/95 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-12px_32px_rgba(23,33,31,0.08)]" onSubmit={submit}>
      <Textarea
        value={draft}
        disabled={state.isBusy || !state.sessionStarted}
        placeholder={goalHint || "상대에게 건넬 말"}
        title={goalHint || undefined}
        className="min-h-10 resize-none rounded-2xl bg-background py-2 text-sm leading-snug"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            if (canSend) {
              void actions.submitMessage(draft);
              setDraft("");
            }
          }
        }}
      />
      <Button className="self-end" type="submit" disabled={!canSend}>
        전송
      </Button>
    </form>
  );
}

function FeedbackScreen({ state, actions }) {
  return (
    <Card>
      <img className="aspect-video w-full rounded-t-xl object-cover" src="/assets/feedback-report.jpg" alt="피드백 리포트" />
      <CardHeader>
        <CardTitle>피드백 리포트</CardTitle>
        <CardDescription>{state.isBusy ? "대화 내용을 바탕으로 피드백을 생성하고 있습니다." : "훈련 결과를 확인하세요."}</CardDescription>
      </CardHeader>
      <CardContent className="feedback-content grid gap-3">
        {state.shareNotice ? <Alert><CheckCircle2 /><AlertTitle>공유</AlertTitle><AlertDescription>{state.shareNotice}</AlertDescription></Alert> : null}
        {state.latestFeedbackText ? <div dangerouslySetInnerHTML={{ __html: state.latestFeedbackHtml }} /> : <p className="text-muted-foreground">잠시만 기다려주세요.</p>}
        {!state.isBusy && state.latestFeedbackText ? <Button variant="outline" onClick={actions.shareFeedback}>리포트 공유/복사</Button> : null}
      </CardContent>
    </Card>
  );
}

function HistoryScreen({ state, actions }) {
  const [filters, setFilters] = useState(state.history.filters);
  const stats = state.history.stats || {};
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>성장 요약</CardTitle>
          <CardDescription>반복 훈련과 최근 피드백을 요약합니다.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <Metric label="전체 훈련" value={formatCount(stats.totalConversations)} />
          <Metric label="이번 달" value={formatCount(stats.thisMonthConversations)} />
          <p className="col-span-full text-sm text-muted-foreground"><b>최근 피드백</b> {stats.recentFeedbackThemes?.[0] || "피드백이 쌓이면 반복 포인트를 보여줍니다."}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="grid gap-3 pt-6">
          <Input value={filters.q || ""} placeholder="검색" onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} />
          <SelectControl id="history-status" label="상태" value={filters.status || "all"} onChange={(status) => setFilters((value) => ({ ...value, status: status === "all" ? "" : status }))} placeholder="전체 상태" options={[{ value: "all", label: "전체 상태" }, { value: "finished", label: "완료" }, { value: "active", label: "진행 중" }]} />
          <Button variant="secondary" onClick={() => actions.loadHistory(filters)}>필터 적용</Button>
        </CardContent>
      </Card>
      {state.history.loading ? <p className="text-sm text-muted-foreground">기록을 불러오는 중입니다.</p> : null}
      {state.history.items.length ? state.history.items.map((item) => <HistoryCard key={item.id} item={item} state={state} actions={actions} />) : <EmptyCard text="조건에 맞는 훈련 기록이 없습니다." />}
    </div>
  );
}

function HistoryCard({ item, state, actions }) {
  const labels = sessionLabels(item.session, state.personas);
  const active = item.status !== "finished";
  return (
    <Card>
      <CardHeader>
        <CardTitle>{labels.persona} · {active ? "진행 중" : "완료"}</CardTitle>
        <CardDescription>{formatDate(item.createdAt)}</CardDescription>
        <CardAction><Badge variant={active ? "secondary" : "outline"}>{active ? "진행" : "완료"}</Badge></CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-sm text-muted-foreground">{labels.relationship} · {labels.setting}</p>
        <p className="text-sm"><b>훈련 초점</b> {labels.goal}</p>
        {item.feedbackSummary ? <p className="rounded-xl bg-muted p-3 text-sm">{item.feedbackSummary}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => { actions.loadHistoryDetail(item.id); actions.goTo("historyDetail"); }}>상세</Button>
          <Button variant="secondary" onClick={() => active ? actions.continueHistoryConversation(item.id) : actions.restoreSession(item.session)}>
            {active ? "대화 이어가기" : "같은 설정으로 다시"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryDetailScreen({ state, actions }) {
  const item = state.history.detail;
  if (!item) return <EmptyCard text="기록을 불러오는 중입니다." />;
  const labels = sessionLabels(item.session, state.personas);
  const active = item.status !== "finished";
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{labels.persona}</CardTitle>
          <CardDescription>{formatDate(item.createdAt)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <p>{labels.relationship} · {labels.setting}</p>
          <p><b>훈련 초점</b> {labels.goal}</p>
          <Button onClick={() => active ? actions.resumeConversation(item) : actions.restoreSession(item.session)}>{active ? "대화 이어가기" : "같은 설정으로 다시 훈련"}</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>대화 전문</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {(item.messages || []).map((message, index) => <p key={index} className={cn("rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap", message.role === "user" && "bg-yellow-100")}><b>{message.role === "user" ? "나" : labels.persona}</b><br />{message.content}</p>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>피드백 리포트</CardTitle></CardHeader>
        <CardContent className="feedback-content" dangerouslySetInnerHTML={{ __html: item.feedbackText ? markdownToHtml(item.feedbackText) : "<p>아직 피드백이 없습니다.</p>" }} />
      </Card>
    </div>
  );
}

function SettingsScreen({ state, actions }) {
  const user = state.auth.user;
  const profile = user?.profile || {};
  const donation = state.appSettings?.donation || {};
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader><CardTitle>내 정보</CardTitle><CardDescription>{user?.email || "이메일 없음"}</CardDescription></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <p><b>이름</b> {profile.name || user?.displayName || "미입력"}</p>
          <p><b>나이/성별</b> {profile.age || "미입력"} · {profile.gender || "미입력"}</p>
          <p><b>소속 교회</b> {profile.church || "미입력"}</p>
          <p><b>사용 용도</b> {profile.useCase || "미입력"}</p>
          <Button variant="secondary" onClick={() => { actions.setProfileForm({ name: profile.name || user?.displayName || "", age: profile.age || "", gender: profile.gender || "", church: profile.church || "", useCase: profile.useCase || "" }); actions.goTo("profile"); }}>프로필 수정</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{donation.title || "후원"}</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          <p>{donation.body || "이 앱의 AI 호출 비용은 운영자가 부담합니다. 지속 운영을 돕고 싶다면 자발적으로 후원할 수 있습니다."}</p>
          <Badge variant="outline">{donation.account || "후원 계좌 준비 중"}</Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>문의</CardTitle>
          <CardDescription>오류, 제안, 협력 문의는 아래 이메일로 연락해주세요.</CardDescription>
        </CardHeader>
        <CardContent>
          <a className="text-sm font-semibold text-primary underline-offset-4 hover:underline" href="mailto:lekas1217@gmail.com">
            lekas1217@gmail.com
          </a>
        </CardContent>
      </Card>
      <Button variant="outline" onClick={actions.logout}>로그아웃</Button>
    </div>
  );
}

function AdminScreen({ state, actions }) {
  if (!state.isAdmin) return <Alert variant="destructive"><AlertCircle /><AlertTitle>권한 없음</AlertTitle><AlertDescription>관리자 권한이 필요합니다.</AlertDescription></Alert>;
  const data = state.admin.data;
  const [filters, setFilters] = useState(state.admin.filters);
  if (!data) return <EmptyCard text="관리자 데이터를 불러오는 중입니다." />;
  const { summary, users, conversations, usage, settings } = data;
  const cost = settings.settings?.cost || {};
  const monthlyCost = Number(summary.estimatedMonthlyCostKrw || 0);
  const monthlyBudget = Number(cost.monthlyBudgetKrw || 0);
  const budgetRate = monthlyBudget ? percentOf(monthlyCost, monthlyBudget) : 0;
  const warning = monthlyBudget && budgetRate >= 80;
  const byType = summary.byType || {};
  const convDetail = state.admin.conversationDetail;
  const userEditor = state.admin.userEditor;
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>운영 요약</CardTitle>
          <CardDescription>비용·호출량·가입 규모를 문장으로 묶었습니다. 정확한 비교 수치는 바로 아래 지표 카드에서 확인하세요.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm leading-relaxed text-muted-foreground">
          <p>
            이번 달 예상 비용은 <strong className="text-foreground">{formatKrw(monthlyCost)}</strong>
            {monthlyBudget ? (
              <>
                {" "}
                이며, 설정된 월 예산 {formatKrw(monthlyBudget)} 대비 <strong className="text-foreground">{formatPercent(budgetRate)}</strong>를 사용했습니다.
              </>
            ) : (
              <>입니다. 모델 설정에서 월 예산을 넣으면 사용률·남은 금액·경고가 함께 계산됩니다.</>
            )}
          </p>
          <p>
            이번 달 생성형 호출은 약 <strong className="text-foreground">{formatCount(summary.monthlyEvents ?? 0)}</strong>건
            {` (채팅 시작 ${formatCount(byType.chat_start || 0)} · 메시지 ${formatCount(byType.chat_message || 0)} · 피드백 ${formatCount(byType.feedback || 0)})`}
            입니다.
          </p>
          <p>
            가입자 <strong className="text-foreground">{formatCount(summary.users)}</strong>명 · 누적 훈련{" "}
            <strong className="text-foreground">{formatCount(summary.conversations)}</strong>건 중 완료{" "}
            <strong className="text-foreground">{formatCount(summary.finishedConversations)}</strong>건입니다.
          </p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="가입 사용자" value={formatCount(summary.users)} detail={`프로필 완료 ${formatPercent(percentOf(summary.completedProfiles, summary.users))}`} />
        <Metric label="전체 훈련" value={formatCount(summary.conversations)} detail={`완료율 ${formatPercent(percentOf(summary.finishedConversations, summary.conversations))}`} />
        <Metric label="이번 달 훈련" value={formatCount(summary.thisMonthConversations)} detail={`오늘 ${formatCount(summary.todayConversations)}회`} />
        <Metric label="예산 사용률" value={monthlyBudget ? formatPercent(budgetRate) : "미설정"} detail={monthlyBudget ? `남은 예산 ${formatKrw(Math.max(0, monthlyBudget - monthlyCost))}` : "월 예산 설정 필요"} />
      </div>
      {warning ? <Alert variant="destructive"><AlertCircle /><AlertTitle>예산 경고</AlertTitle><AlertDescription>월 예산의 {formatPercent(budgetRate)}를 사용했습니다.</AlertDescription></Alert> : null}
      <AdminSettings settings={settings.settings || {}} onSave={actions.saveAdminSettings} />
      <Card>
        <CardHeader>
          <CardTitle>목록·그래프 필터</CardTitle>
          <CardDescription>사용자·훈련·비용 이벤트 목록과 일자별 비용 그래프에 동일한 조건이 적용됩니다. (훈련 목록은 최대 200건, 비용 이벤트는 최대 500건까지 불러옵니다.)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Input placeholder="사용자/모델/훈련 검색" value={filters.q || ""} onChange={(event) => setFilters((value) => ({ ...value, q: event.target.value }))} />
          <div className="grid gap-3 rounded-2xl border bg-muted/40 p-3">
            <div className="grid gap-2">
              <Label htmlFor="admin-from">시작일</Label>
              <Input id="admin-from" type="date" value={filters.from || ""} onChange={(event) => setFilters((value) => ({ ...value, from: event.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-to">종료일</Label>
              <Input id="admin-to" type="date" value={filters.to || ""} onChange={(event) => setFilters((value) => ({ ...value, to: event.target.value }))} />
            </div>
          </div>
          <SelectControl id="admin-status" label="훈련 상태" value={filters.status || "all"} onChange={(status) => setFilters((value) => ({ ...value, status: status === "all" ? "" : status }))} placeholder="전체 상태" options={[{ value: "all", label: "전체 상태" }, { value: "finished", label: "완료" }, { value: "active", label: "진행 중" }]} />
          <Button className="rounded-full" onClick={() => actions.loadAdmin(filters)}>필터 적용</Button>
        </CardContent>
      </Card>
      <UsageChart usage={usage} />
      <AdminTables state={state} users={users.users || []} conversations={conversations.conversations || []} usage={usage} actions={actions} />
      <AdminConversationDrawer detail={convDetail} personas={state.personas} onClose={actions.closeAdminConversationDetail} />
      <AdminUserEditorDrawer editor={userEditor} actions={actions} />
    </div>
  );
}

function AdminConversationDrawer({ detail, personas, onClose }) {
  const open = Boolean(detail);
  const conv = detail?.conversation;
  const labels = conv ? sessionLabels(conv.session, personas) : null;
  return (
    <Drawer open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>훈련·피드백 상세</DrawerTitle>
          <DrawerDescription>
            {conv && labels ? `${labels.persona} · ${formatDate(conv.createdAt)} · ${conv.status === "finished" ? "완료" : "진행 중"}` : "관리자 권한으로 대화 전문과 피드백을 확인합니다."}
          </DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[60vh] overflow-y-auto px-4 pb-2">
          {detail?.loading ? <p className="text-sm text-muted-foreground">불러오는 중입니다.</p> : null}
          {detail?.error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>불러오기 실패</AlertTitle>
              <AlertDescription>{detail.error}</AlertDescription>
            </Alert>
          ) : null}
          {conv && labels ? (
            <div className="grid gap-4 pb-4">
              <div className="grid gap-1 text-sm text-muted-foreground">
                <p><b className="text-foreground">사용자</b> {conv.user?.name || conv.user?.email || "—"}</p>
                <p>{labels.relationship} · {labels.setting}</p>
                <p><b className="text-foreground">훈련 초점</b> {labels.goal}</p>
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">대화 전문</CardTitle></CardHeader>
                <CardContent className="grid gap-2">
                  {(conv.messages || []).map((message, index) => (
                    <p key={index} className={cn("rounded-xl bg-muted p-3 text-sm whitespace-pre-wrap", message.role === "user" && "bg-yellow-100")}>
                      <b>{message.role === "user" ? "훈련자" : labels.persona}</b>
                      <br />
                      {message.content}
                    </p>
                  ))}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-base">피드백 리포트</CardTitle></CardHeader>
                <CardContent className="feedback-content text-sm" dangerouslySetInnerHTML={{ __html: conv.feedbackText ? markdownToHtml(conv.feedbackText) : "<p>아직 피드백이 없습니다.</p>" }} />
              </Card>
            </div>
          ) : null}
        </div>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button type="button" variant="secondary">닫기</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function AdminUserEditorDrawer({ editor, actions }) {
  return (
    <Drawer open={Boolean(editor)} onOpenChange={(next) => { if (!next) actions.closeAdminUserEditor(); }}>
      {editor ? (
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader>
            <DrawerTitle>사용자 정보</DrawerTitle>
            <DrawerDescription>표시 이름·프로필·역할을 수정합니다. 이메일은 로그인 식별용으로 여기서 바꿀 수 없습니다.</DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[58vh] overflow-y-auto px-4 pb-2">
            <div className="grid gap-3 text-sm">
              <p className="rounded-xl bg-muted/60 px-3 py-2 text-muted-foreground"><b className="text-foreground">이메일</b> {editor.email}</p>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-display">표시 이름</Label>
                <Input
                  id="admin-user-display"
                  value={editor.displayName}
                  onChange={(e) => actions.setAdminUserEditor({ displayName: e.target.value })}
                />
              </div>
              <SelectControl
                id="admin-user-role"
                label="역할"
                value={editor.role}
                onChange={(role) => actions.setAdminUserEditor({ role })}
                placeholder="역할"
                options={[
                  { value: "user", label: "일반 사용자" },
                  { value: "admin", label: "관리자" }
                ]}
              />
              <div className="grid gap-2">
                <Label htmlFor="admin-user-name">이름</Label>
                <Input
                  id="admin-user-name"
                  value={editor.profile.name}
                  onChange={(e) => actions.setAdminUserEditorProfile({ name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-age">나이</Label>
                <Input
                  id="admin-user-age"
                  value={editor.profile.age}
                  onChange={(e) => actions.setAdminUserEditorProfile({ age: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-gender">성별</Label>
                <Input
                  id="admin-user-gender"
                  value={editor.profile.gender}
                  onChange={(e) => actions.setAdminUserEditorProfile({ gender: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-church">소속 교회</Label>
                <Input
                  id="admin-user-church"
                  value={editor.profile.church}
                  onChange={(e) => actions.setAdminUserEditorProfile({ church: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-user-usecase">사용 용도</Label>
                <Input
                  id="admin-user-usecase"
                  value={editor.profile.useCase}
                  onChange={(e) => actions.setAdminUserEditorProfile({ useCase: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DrawerFooter className="gap-2">
            <Button type="button" disabled={editor.saving} onClick={() => void actions.saveAdminUser()}>
              {editor.saving ? "저장 중…" : "저장"}
            </Button>
            <DrawerClose asChild>
              <Button type="button" variant="outline">취소</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      ) : null}
    </Drawer>
  );
}

function Metric({ label, value, detail }) {
  return (
    <Card>
      <CardContent className="grid gap-1 p-4">
        <strong className="text-2xl font-black text-primary">{value || 0}</strong>
        <span className="text-xs font-black text-muted-foreground">{label}</span>
        {detail ? <small className="text-xs text-muted-foreground">{detail}</small> : null}
      </CardContent>
    </Card>
  );
}

function UsageChart({ usage }) {
  const chartConfig = {
    estimatedCostKrw: { label: "비용", color: "var(--chart-1)" },
    events: { label: "이벤트", color: "var(--chart-2)" }
  };
  const rows = usage.byDay?.length ? usage.byDay : [{ date: "없음", estimatedCostKrw: 0, events: 0 }];
  return (
    <Card>
      <CardHeader>
        <CardTitle>기간별 비용 그래프</CardTitle>
        <CardDescription>필터 기간의 일자별 예상 비용입니다. OpenAI는 env 단가, Anthropic은 모델별 Sonnet/Opus/Haiku MTok 단가(2026-05 문서 기준 기본값, env로 조정)로 추정합니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] min-h-[300px] w-full">
          <BarChart accessibilityLayer data={rows}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={10} minTickGap={18} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="estimatedCostKrw" fill="var(--color-estimatedCostKrw)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function AdminTables({ state, users, conversations, usage, actions }) {
  return (
    <Accordion type="multiple" defaultValue={["users", "conversations", "usage"]} className="grid gap-3">
      <AdminAccordion value="users" title="사용자별 사용량">
        <div className="grid gap-2">
          {users.map((user) => (
            <AdminListRow
              key={user.id}
              title={user.profile?.name || user.displayName || user.email}
              subtitle={user.email}
              badge={user.role === "admin" ? <Badge variant="secondary">관리자</Badge> : null}
              items={[
                ["역할", user.role === "admin" ? "관리자" : "일반"],
                ["프로필", user.profileComplete ? "완료" : "미완료"],
                ["교회", user.profile?.church || "—"],
                ["훈련", `${formatCount(user.conversationCount)}회`],
                ["월 비용", formatKrw(user.usage?.estimatedMonthlyCostKrw)]
              ]}
              footer={
                <Button type="button" variant="outline" size="sm" className="w-full rounded-full" onClick={() => actions.openAdminUserEditor(user)}>
                  사용자 정보 편집
                </Button>
              }
            />
          ))}
          {!users.length ? <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">사용자가 없습니다.</p> : null}
        </div>
      </AdminAccordion>
      <AdminAccordion value="conversations" title="훈련·피드백 기록">
        <div className="grid gap-2">
          {conversations.map((item) => {
            const labels = sessionLabels(item.session, state.personas);
            return (
              <AdminListRow
                key={item.id}
                title={item.user?.name || item.user?.email || "사용자"}
                subtitle={`${labels.persona} · ${formatDate(item.createdAt)}`}
                badge={<Badge variant={item.status === "finished" ? "outline" : "secondary"}>{item.status === "finished" ? "완료" : "진행"}</Badge>}
                items={[
                  ["훈련 초점", labels.goal],
                  ["관계/상황", `${labels.relationship} · ${labels.setting}`],
                  ["메시지", `${formatCount(item.messageCount)}개`],
                  ["피드백 요약", item.feedbackSummary || "—"]
                ]}
                footer={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full rounded-full"
                    onClick={() => void actions.loadAdminConversationDetail(item.id)}
                  >
                    대화·피드백 전체 보기
                  </Button>
                }
              />
            );
          })}
          {!conversations.length ? <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">훈련 기록이 없습니다.</p> : null}
        </div>
      </AdminAccordion>
      <AdminAccordion value="usage" title="비용 이벤트 (필터 구간)">
        <div className="grid gap-2">
          {(usage.events || []).slice(0, 80).map((event) => (
            <AdminListRow
              key={event.id}
              title={usageEventLabel(event.eventType)}
              subtitle={formatDate(event.createdAt)}
              items={[
                ["공급자", event.provider || "openai"],
                ["모델", event.model || "모델 미기록"],
                ["비용", formatKrw(event.estimatedCostKrw)]
              ]}
            />
          ))}
          {!usage.events?.length ? <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">사용량 이벤트가 없습니다.</p> : null}
        </div>
      </AdminAccordion>
    </Accordion>
  );
}

function AdminListRow({ title, subtitle, badge, items = [], footer }) {
  return (
    <article className="grid min-w-0 gap-3 rounded-2xl border bg-background p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <strong className="block truncate text-sm">{title}</strong>
          {subtitle ? <span className="block break-words text-xs leading-5 text-muted-foreground">{subtitle}</span> : null}
        </div>
        {badge ? <div className="shrink-0">{badge}</div> : null}
      </div>
      <div className="grid gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="grid min-w-0 grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] gap-2 rounded-xl bg-muted/60 px-3 py-2 text-sm">
            <span className="font-black text-muted-foreground">{label}</span>
            <span className="min-w-0 break-words text-right font-semibold">{value}</span>
          </div>
        ))}
      </div>
      {footer}
    </article>
  );
}

function AdminAccordion({ value, title, children }) {
  return (
    <AccordionItem value={value} className="rounded-xl border bg-card px-4">
      <AccordionTrigger className="font-black">{title}</AccordionTrigger>
      <AccordionContent>{children}</AccordionContent>
    </AccordionItem>
  );
}

const openaiChatModels = [
  { value: "gpt-5.5-mini", label: "GPT 5.5 mini" },
  { value: "gpt-5.5", label: "GPT 5.5" },
  { value: "gpt-5.4-mini", label: "GPT 5.4 mini" },
  { value: "gpt-5.4", label: "GPT 5.4" },
  { value: "chat-latest", label: "Chat latest" }
];

const openaiFeedbackModels = [
  { value: "gpt-5.5", label: "GPT 5.5" },
  { value: "gpt-5.5-mini", label: "GPT 5.5 mini" },
  { value: "gpt-5.4", label: "GPT 5.4" },
  { value: "gpt-5.4-mini", label: "GPT 5.4 mini" }
];

const anthropicChatModels = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5 (스냅샷)" },
  { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5 (스냅샷)" }
];

const anthropicFeedbackModels = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-haiku-4-5", label: "Claude Haiku 4.5" }
];

const defaultModelSettings = {
  chat: {
    provider: "openai",
    model: "gpt-5.4-mini",
    maxOutputTokens: 1400,
    temperature: "",
    topP: "",
    reasoningEffort: "high",
    thinkingType: "disabled",
    thinkingBudgetTokens: 8192,
    thinkingDisplay: "omitted"
  },
  feedback: {
    provider: "openai",
    model: "gpt-5.4",
    maxOutputTokens: 2600,
    temperature: "",
    topP: "",
    reasoningEffort: "medium",
    thinkingType: "disabled",
    thinkingBudgetTokens: 8192,
    thinkingDisplay: "omitted"
  }
};

function normalizeAdminSettings(settings = {}) {
  return {
    donation: settings.donation || {},
    cost: settings.cost || {},
    ai: {
      chat: { ...defaultModelSettings.chat, ...(settings.ai?.chat || {}) },
      feedback: { ...defaultModelSettings.feedback, ...(settings.ai?.feedback || {}) }
    }
  };
}

function ModelSettingsCard({ kind, title, description, settings, onChange }) {
  const prefix = kind === "feedback" ? "feedback" : "chat";
  const defaults = defaultModelSettings[prefix];
  const merged = { ...defaults, ...settings };
  const provider = merged.provider === "anthropic" ? "anthropic" : "openai";
  const modelOptions =
    provider === "anthropic"
      ? kind === "feedback"
        ? anthropicFeedbackModels
        : anthropicChatModels
      : kind === "feedback"
        ? openaiFeedbackModels
        : openaiChatModels;
  const update = (field, value) => onChange(`ai.${prefix}.${field}`, value);

  const setProvider = (next) => {
    update("provider", next);
    if (next === "anthropic") {
      const pick = kind === "feedback" ? anthropicFeedbackModels[0]?.value : anthropicChatModels[0]?.value;
      update("model", pick || "claude-sonnet-4-6");
    } else {
      const pick = kind === "feedback" ? openaiFeedbackModels[0]?.value : openaiChatModels[0]?.value;
      update("model", pick || "gpt-5.4-mini");
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SelectControl
          id={`${prefix}-provider`}
          label="공급자"
          value={provider}
          onChange={setProvider}
          placeholder="공급자 선택"
          options={[
            { value: "openai", label: "OpenAI" },
            { value: "anthropic", label: "Anthropic" }
          ]}
        />
        <SelectControl
          id={`${prefix}-model`}
          label="모델"
          value={merged.model || defaults.model}
          onChange={(model) => update("model", model)}
          placeholder="모델 선택"
          options={modelOptions}
        />
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`${prefix}-max-output`}>최대 출력 토큰</Label>
            <Input
              id={`${prefix}-max-output`}
              type="number"
              min="1"
              max="64000"
              value={merged.maxOutputTokens ?? defaults.maxOutputTokens}
              onChange={(event) => update("maxOutputTokens", Number(event.target.value || defaults.maxOutputTokens))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${prefix}-temperature`}>Temperature</Label>
            <Input
              id={`${prefix}-temperature`}
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={merged.temperature ?? ""}
              placeholder="기본값"
              onChange={(event) => update("temperature", event.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}-top-p`}>Top P</Label>
          <Input
            id={`${prefix}-top-p`}
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={merged.topP ?? ""}
            placeholder="기본값"
            onChange={(event) => update("topP", event.target.value)}
          />
        </div>
        {provider === "openai" ? (
          <SelectControl
            id={`${prefix}-reasoning`}
            label="추론 강도 (reasoning effort)"
            value={merged.reasoningEffort || defaults.reasoningEffort}
            onChange={(reasoningEffort) => update("reasoningEffort", reasoningEffort)}
            placeholder="추론 강도"
            options={[
              { value: "none", label: "없음" },
              { value: "minimal", label: "최소" },
              { value: "low", label: "낮음" },
              { value: "medium", label: "중간" },
              { value: "high", label: "높음" },
              { value: "xhigh", label: "매우 높음" }
            ]}
          />
        ) : (
          <div className="grid gap-3 rounded-2xl border bg-muted/30 p-3">
            <p className="text-xs font-black uppercase text-primary">Anthropic 추론(Thinking)</p>
            <SelectControl
              id={`${prefix}-thinking-type`}
              label="Thinking 유형"
              value={merged.thinkingType || defaults.thinkingType}
              onChange={(thinkingType) => update("thinkingType", thinkingType)}
              placeholder="Thinking"
              options={[
                { value: "disabled", label: "끔" },
                { value: "adaptive", label: "Adaptive" },
                { value: "enabled", label: "Enabled (예산)" }
              ]}
            />
            {merged.thinkingType === "enabled" ? (
              <div className="grid gap-2">
                <Label htmlFor={`${prefix}-thinking-budget`}>Thinking 예산 토큰</Label>
                <Input
                  id={`${prefix}-thinking-budget`}
                  type="number"
                  min="1024"
                  max="64000"
                  step="256"
                  value={merged.thinkingBudgetTokens || defaults.thinkingBudgetTokens}
                  onChange={(event) => update("thinkingBudgetTokens", Number(event.target.value || defaults.thinkingBudgetTokens))}
                />
                <p className="text-xs text-muted-foreground">Enabled일 때만 API에 전달됩니다. 최소 1024.</p>
              </div>
            ) : null}
            {merged.thinkingType === "adaptive" ? (
              <SelectControl
                id={`${prefix}-thinking-display`}
                label="Thinking 표시"
                value={merged.thinkingDisplay || defaults.thinkingDisplay}
                onChange={(thinkingDisplay) => update("thinkingDisplay", thinkingDisplay)}
                placeholder="표시 방식"
                options={[
                  { value: "omitted", label: "생략" },
                  { value: "summarized", label: "요약" }
                ]}
              />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AdminSettings({ settings, onSave }) {
  const [form, setForm] = useState(() => normalizeAdminSettings(settings));
  const [status, setStatus] = useState("");
  const settingsSyncKey = JSON.stringify(settings?.ai || {}) + JSON.stringify(settings?.cost || {}) + JSON.stringify(settings?.donation || {});

  useEffect(() => {
    setForm(normalizeAdminSettings(settings));
    setStatus("");
  }, [settingsSyncKey]);

  const update = (path, value) => {
    setForm((current) => {
      const next = structuredClone(current);
      const keys = path.split(".");
      let target = next;
      for (const key of keys.slice(0, -1)) target = target[key] ||= {};
      target[keys.at(-1)] = value;
      return next;
    });
  };
  return (
    <Accordion type="single" collapsible defaultValue="settings">
      <AccordionItem value="settings" className="rounded-xl border bg-card px-4">
        <AccordionTrigger className="font-black">모델 설정</AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-3">
            <ModelSettingsCard
              kind="chat"
              title="챗봇 모델 설정"
              description="대화 상대 페르소나가 응답할 때 사용하는 모델입니다."
              settings={form.ai.chat}
              onChange={update}
            />
            <ModelSettingsCard
              kind="feedback"
              title="피드백 모델 설정"
              description="훈련 종료 후 리포트를 생성할 때 사용하는 모델입니다."
              settings={form.ai.feedback}
              onChange={update}
            />
            <Button onClick={async () => { await onSave({ ...form, donation: { ...form.donation, enabled: true } }); setStatus("저장했습니다."); }}>모델 설정 저장</Button>
            {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function EmptyCard({ text }) {
  return (
    <Card>
      <CardContent className="p-6 text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

export default function App() {
  const { state, actions } = useAppController();
  let screen = null;
  if (state.currentScreen === "home") screen = <HomeScreen state={state} actions={actions} />;
  if (state.currentScreen === "login") screen = <LoginScreen state={state} actions={actions} />;
  if (state.currentScreen === "profile") screen = <ProfileScreen state={state} actions={actions} />;
  if (state.currentScreen === "persona") screen = <PersonaScreen state={state} actions={actions} />;
  if (state.currentScreen === "context") screen = <ContextScreen state={state} actions={actions} />;
  if (state.currentScreen === "review") screen = <ReviewScreen state={state} actions={actions} />;
  if (state.currentScreen === "chat") screen = <ChatScreen state={state} actions={actions} />;
  if (state.currentScreen === "feedback") screen = <FeedbackScreen state={state} actions={actions} />;
  if (state.currentScreen === "history") screen = <HistoryScreen state={state} actions={actions} />;
  if (state.currentScreen === "historyDetail") screen = <HistoryDetailScreen state={state} actions={actions} />;
  if (state.currentScreen === "settings") screen = <SettingsScreen state={state} actions={actions} />;
  if (state.currentScreen === "admin") screen = <AdminScreen state={state} actions={actions} />;
  return (
    <AppShell state={state} actions={actions}>
      {state.errors.global ? <Alert className="mb-4" variant="destructive"><AlertCircle /><AlertTitle>오류</AlertTitle><AlertDescription>{state.errors.global}</AlertDescription></Alert> : null}
      {screen}
    </AppShell>
  );
}
