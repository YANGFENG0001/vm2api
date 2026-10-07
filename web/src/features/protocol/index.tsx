import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { VIEW_TITLES } from '@/config/nav'
import { ChevronDown, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeader } from '@/components/page-header'
import { CardGridSkeleton } from '@/components/page-skeletons'
import { QueryGate } from '@/components/query-gate'
import { modelsQueryOptions } from '@/features/models/queries'
import { dashboardQueryOptions } from '@/features/overview/queries'
import { DistillCard } from './distill-card'
import { JevInterceptCard } from './jev-card'
import { protocolEntryQueryOptions } from './queries'
import { QuestionBankCard } from './question-bank-card'
import { RefusalGuardCard } from './refusal-guard-card'

function copy(text: string) {
  void navigator.clipboard.writeText(text)
  toast.success('已复制')
}

type EntryItem = {
  by: string
  label: string
  keyword: string
  rule: string
  count: number
}

function sumCount(items: EntryItem[], by?: string) {
  return items.reduce(
    (sum, item) => sum + (by && item.by !== by ? 0 : item.count),
    0
  )
}

function share(part: number, whole: number) {
  if (!whole) return '0%'
  return `${Math.round((part / whole) * 100)}%`
}

function StatButton({
  value,
  label,
  hint,
  pressed,
  onClick,
}: {
  value: number
  label: string
  hint?: string
  pressed?: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      aria-pressed={pressed}
      onClick={onClick}
      className='cursor-pointer rounded-lg border px-3 py-2 text-left transition-colors duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:border-foreground/30 aria-pressed:bg-muted/50'
    >
      <div className='text-2xl font-semibold tabular-nums'>{value}</div>
      <div className='text-xs text-muted-foreground'>{label}</div>
      {hint ? (
        <div className='text-xs text-muted-foreground tabular-nums'>{hint}</div>
      ) : null}
    </button>
  )
}

function RuleTable({ items }: { items: EntryItem[] }) {
  if (!items.length) {
    return <p className='text-sm text-muted-foreground'>没有</p>
  }
  return (
    <Table density='compact'>
      <TableHeader>
        <TableRow>
          <TableHead>来源</TableHead>
          <TableHead>命中</TableHead>
          <TableHead>规则</TableHead>
          <TableHead className='text-right'>数量</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={`${item.by}:${item.keyword}:${item.rule}`}>
            <TableCell>{item.label}</TableCell>
            <TableCell className='font-mono text-xs'>
              {item.keyword || '—'}
            </TableCell>
            <TableCell className='max-w-64 truncate font-mono text-xs text-muted-foreground'>
              {item.rule || '—'}
            </TableCell>
            <TableCell className='text-right tabular-nums'>
              {item.count}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function EntryStats() {
  const q = useQuery(protocolEntryQueryOptions())
  const blocks = q.data?.blocks || []
  const passes = q.data?.passes || []
  const blocked = q.data?.blocked ?? 0
  const passed = q.data?.passed ?? 0
  const total = blocked + passed
  const jevWash = sumCount(passes, 'jev')
  const jevBlock = sumCount(blocks, 'jev')
  const [open, setOpen] = useState(false)
  const [ruleBy, setRuleBy] = useState<string | null>(null)
  const sources: { by: string; label: string }[] = []
  for (const item of blocks) {
    if (sources.some((source) => source.by === item.by)) continue
    sources.push({ by: item.by, label: item.label })
  }
  const shown = ruleBy ? blocks.filter((item) => item.by === ruleBy) : blocks

  function show(by: string | null) {
    setRuleBy(by)
    setOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>今天</CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        {q.isLoading ? (
          <p className='text-sm text-muted-foreground'>读取中</p>
        ) : q.error ? (
          <p className='text-sm text-destructive' role='alert'>
            {(q.error as Error).message}
          </p>
        ) : (
          <>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5'>
              <StatButton
                value={total}
                label='请求'
                pressed={open && ruleBy === null}
                onClick={() => show(null)}
              />
              <StatButton
                value={blocked}
                label='拦截'
                hint={share(blocked, total)}
                pressed={open && ruleBy === null}
                onClick={() => show(null)}
              />
              <StatButton
                value={passed}
                label='放行'
                hint={share(passed, total)}
                pressed={open && ruleBy === 'pass'}
                onClick={() => show('pass')}
              />
              <StatButton
                value={jevWash}
                label='Jev 清洗'
                hint={share(jevWash, total)}
                pressed={open && ruleBy === 'jev-pass'}
                onClick={() => show('jev-pass')}
              />
              <StatButton
                value={jevBlock}
                label='Jev 拦截'
                hint={share(jevBlock, total)}
                pressed={open && ruleBy === 'jev'}
                onClick={() => show('jev')}
              />
            </div>
            <Collapsible open={open} onOpenChange={setOpen}>
              <CollapsibleTrigger className='flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none data-[state=open]:[&_svg]:rotate-180'>
                <span>详情</span>
                <span className='flex items-center gap-2 text-xs text-muted-foreground'>
                  {blocks.length} 条规则
                  <ChevronDown
                    className='size-4 transition-transform duration-200 motion-reduce:transition-none'
                    aria-hidden='true'
                  />
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent className='mt-3 space-y-3'>
                <div className='flex flex-wrap gap-1.5'>
                  <FilterChip
                    label='全部规则'
                    count={blocked}
                    pressed={ruleBy === null}
                    onClick={() => setRuleBy(null)}
                  />
                  {sources.map((source) => (
                    <FilterChip
                      key={source.by}
                      label={source.label}
                      count={sumCount(blocks, source.by)}
                      pressed={ruleBy === source.by}
                      onClick={() => setRuleBy(source.by)}
                    />
                  ))}
                  <FilterChip
                    label='Jev 清洗'
                    count={jevWash}
                    pressed={ruleBy === 'jev-pass'}
                    onClick={() => setRuleBy('jev-pass')}
                  />
                  <FilterChip
                    label='放行'
                    count={passed}
                    pressed={ruleBy === 'pass'}
                    onClick={() => setRuleBy('pass')}
                  />
                </div>
                {ruleBy === 'pass' || ruleBy === 'jev-pass' ? (
                  <RuleTable
                    items={
                      ruleBy === 'jev-pass'
                        ? passes.filter((item) => item.by === 'jev')
                        : passes
                    }
                  />
                ) : (
                  <RuleTable items={shown} />
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function FilterChip({
  label,
  count,
  pressed,
  onClick,
}: {
  label: string
  count: number
  pressed: boolean
  onClick: () => void
}) {
  return (
    <button
      type='button'
      aria-pressed={pressed}
      onClick={onClick}
      className='cursor-pointer rounded-md border px-2 py-1 text-xs transition-colors duration-200 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:bg-muted'
    >
      {label}
      <span className='ml-1 text-muted-foreground tabular-nums'>{count}</span>
    </button>
  )
}

export function ProtocolPage() {
  const dash = useQuery(dashboardQueryOptions())
  const models = useQuery(modelsQueryOptions())
  const base = String(dash.data?.health?.base_url || location.origin).replace(
    /\/$/,
    ''
  )
  const items = models.data?.items || []
  const endpoints = [`${base}/v1`, `${base}/v1/messages`]

  return (
    <PageHeader title={VIEW_TITLES.protocol}>
      <p className='mb-4 max-w-2xl text-sm text-muted-foreground'>
        入站按蒸馏、硬正则、拒答缓存、决策模型这个顺序处理。一次只改一块。
      </p>
      <Tabs defaultValue='intercept'>
        <TabsList>
          <TabsTrigger value='entry' className='cursor-pointer px-4'>
            入口
          </TabsTrigger>
          <TabsTrigger value='distill' className='cursor-pointer px-4'>
            蒸馏
          </TabsTrigger>
          <TabsTrigger value='intercept' className='cursor-pointer px-4'>
            拦截
          </TabsTrigger>
          <TabsTrigger value='bank' className='cursor-pointer px-4'>
            题库
          </TabsTrigger>
          <TabsTrigger value='refusal' className='cursor-pointer px-4'>
            拒答
          </TabsTrigger>
        </TabsList>

        <TabsContent value='entry' className='mt-4 space-y-4'>
          <EntryStats />
          <QueryGate
            loading={dash.isLoading || models.isLoading}
            error={dash.error || models.error}
            skeleton={
              <CardGridSkeleton
                cards={2}
                className='grid gap-4 lg:grid-cols-2'
              />
            }
          >
            <div className='grid gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader>
                  <CardTitle>端点</CardTitle>
                </CardHeader>
                <CardContent className='space-y-2'>
                  {endpoints.map((url) => (
                    <div
                      key={url}
                      className='flex items-center justify-between gap-3 rounded-lg border px-3 py-2'
                    >
                      <code className='min-w-0 truncate text-sm'>{url}</code>
                      <Button
                        size='sm'
                        variant='outline'
                        className='cursor-pointer'
                        onClick={() => copy(url)}
                      >
                        <Copy className='size-3.5' aria-hidden='true' />
                        复制
                      </Button>
                    </div>
                  ))}
                  <p className='text-xs text-muted-foreground'>
                    system 提示词在{' '}
                    <Link to='/system' className='underline underline-offset-4'>
                      system提示词
                    </Link>
                    。数据面在{' '}
                    <Link to='/wrap' className='underline underline-offset-4'>
                      内核页
                    </Link>
                    。
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>模型 id</CardTitle>
                </CardHeader>
                <CardContent>
                  {items.length ? (
                    <div className='flex flex-wrap gap-1.5'>
                      {items.map((m) => (
                        <button
                          key={m.id}
                          type='button'
                          className={cn(
                            'cursor-pointer rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground'
                          )}
                          onClick={() => copy(m.id)}
                        >
                          {m.id}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className='text-sm text-muted-foreground'>
                      还没有模型。
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </QueryGate>
        </TabsContent>

        <TabsContent value='distill' className='mt-4'>
          <DistillCard />
        </TabsContent>
        <TabsContent value='intercept' className='mt-4'>
          <JevInterceptCard />
        </TabsContent>
        <TabsContent value='bank' className='mt-4'>
          <QuestionBankCard />
        </TabsContent>
        <TabsContent value='refusal' className='mt-4'>
          <RefusalGuardCard />
        </TabsContent>
      </Tabs>
    </PageHeader>
  )
}
