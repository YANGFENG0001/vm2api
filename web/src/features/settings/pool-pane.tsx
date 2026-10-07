import {
  ArrowRightLeft,
  Armchair,
  Hourglass,
  Layers,
  ShieldAlert,
  Zap,
} from 'lucide-react'
import { fmtDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { SEAT_CAP_MAX, SeatCells } from '@/components/scheduler-viz'
import { SEAT_CAP_STEPS, withCurrent } from '@/features/vm/scheduling-steps'
import { PoolLivePanel } from './pool-live-panel'
import {
  ChipGroup,
  PaneSection,
  SliderSetting,
  StepperSetting,
} from './scheduler-controls'

type Obj = Record<string, unknown>

type PoolPaneProps = {
  pool: Obj
  failover: Obj
  inference: Obj
  onPoolChange: (next: Obj) => void
  onFailoverChange: (next: Obj) => void
  onInferenceChange: (next: Obj) => void
}

/** 与后端 DEFAULT_POOL_ROUTING / failover-runner 默认值一致。 */
const POOL_DEFAULTS = {
  queue_max: 50,
  seat_grace_ms: 30000,
  seat_budget_reserve_pct: 0.02,
  sticky_wait_timeout_ms: 45000,
  fallback_wait_timeout_ms: 30000,
  circuit_failure_threshold: 3,
  circuit_open_ms: 30000,
}
const FAILOVER_DEFAULTS = {
  max_same_account_retries: 1,
  same_account_retry_delay_ms: 500,
  max_account_switches: 10,
  max_total_attempts: 12,
  total_retry_deadline_ms: 120000,
  oauth_401_cooldown_ms: 120000,
}
function numOf(source: Obj, key: string, fallback: number): number {
  const n = Number(source[key] ?? fallback)
  return Number.isFinite(n) ? n : fallback
}

const STRATEGIES: {
  id: 'balanced' | 'fill'
  title: string
  desc: string
  demo: number[]
  next: number
}[] = [
  {
    id: 'balanced',
    title: '平衡',
    desc: '新设备先去占用比例最低的 VM，负载摊平，单台额度消耗慢。',
    demo: [2, 1, 3],
    next: 1,
  },
  {
    id: 'fill',
    title: '填充',
    desc: '新设备先去占用比例最高、还没满的 VM，集中用满少数几台，其它保持空闲。',
    demo: [4, 3, 1],
    next: 1,
  },
]

function StrategyCards({
  value,
  onChange,
}: {
  value: 'balanced' | 'fill'
  onChange: (next: 'balanced' | 'fill') => void
}) {
  return (
    <div
      role='radiogroup'
      aria-label='开席策略'
      className='grid gap-3 sm:grid-cols-2'
    >
      {STRATEGIES.map((s) => {
        const on = s.id === value
        return (
          <button
            key={s.id}
            type='button'
            role='radio'
            aria-checked={on}
            onClick={() => onChange(s.id)}
            className={cn(
              'flex cursor-pointer flex-col gap-3 rounded-lg border p-3 text-left transition-colors duration-150 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              on
                ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                : 'hover:border-primary/40 hover:bg-accent/40'
            )}
          >
            <div className='flex items-center justify-between gap-2'>
              <span className='text-sm font-semibold'>{s.title}</span>
              <span
                aria-hidden
                className={cn(
                  'grid size-4 place-items-center rounded-full border',
                  on ? 'border-primary' : 'border-muted-foreground/40'
                )}
              >
                {on ? (
                  <span className='size-2 rounded-full bg-primary' />
                ) : null}
              </span>
            </div>
            <p className='text-xs leading-5 text-muted-foreground'>{s.desc}</p>
            <div className='grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2'>
              {s.demo.map((used, i) => (
                <div key={i} className='space-y-1'>
                  <div
                    className={cn(
                      'text-[10px] text-muted-foreground',
                      i === s.next && 'font-medium text-foreground'
                    )}
                  >
                    VM {String.fromCharCode(65 + i)}
                    {i === s.next ? ' ← 下一席' : ''}
                  </div>
                  <SeatCells
                    used={used}
                    max={4}
                    next={i === s.next}
                    size='sm'
                  />
                </div>
              ))}
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** 第 k 个席位要求的余量阶梯：(已开 + 1) × 预留，超过 100% 的席位永远开不出。 */
function BudgetStairs({
  reservePct,
  cap,
}: {
  reservePct: number
  cap: number
}) {
  const reachable =
    reservePct > 0 ? Math.min(cap, Math.floor(100 / reservePct)) : cap
  return (
    <div className='space-y-1.5 rounded-md border bg-muted/30 p-2.5'>
      <div className='flex h-14 items-end gap-[3px]' aria-hidden>
        {Array.from({ length: cap }, (_, i) => {
          const need = (i + 1) * reservePct
          return (
            <div
              key={i}
              title={`第 ${i + 1} 席需余量 ≥ ${need.toFixed(1)}%`}
              className={cn(
                'flex-1 rounded-t-[2px]',
                need > 100
                  ? 'bg-[color:var(--status-bad-solid)]/70'
                  : 'bg-primary/60'
              )}
              style={{ height: `${Math.max(4, Math.min(100, need))}%` }}
            />
          )
        })}
      </div>
      <p className='text-[11px] leading-4 text-muted-foreground'>
        {reservePct > 0 ? (
          <>
            开第 1 席需 5h/7d 余量 ≥ {reservePct.toFixed(1)}%，开满 {cap} 席需 ≥{' '}
            {(cap * reservePct).toFixed(1)}%
            {reachable < cap ? (
              <span className='text-[color:var(--status-bad)]'>
                {' '}
                · 第 {reachable + 1} 席起永远开不出
              </span>
            ) : null}
            。余量未知（还没读到 /usage）时放行。
          </>
        ) : (
          '0% = 不看余量，只要席位没满就开。'
        )}
      </p>
    </div>
  )
}

function Segment({
  label,
  ms,
  total,
  className,
}: {
  label: string
  ms: number
  total: number
  className: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center justify-center overflow-hidden px-1 text-[10px] leading-5 font-medium whitespace-nowrap',
        className
      )}
      style={{ width: `${(ms / total) * 100}%` }}
      title={`${label} ${fmtDuration(ms)}`}
    >
      <span className='truncate'>
        {label} {fmtDuration(ms)}
      </span>
    </div>
  )
}

/** 一次请求最长能排多久：有家设备先守原 VM，再进全局；整体被总重试时限截断。 */
function QueueTimeline({
  sticky,
  fallback,
  deadline,
}: {
  sticky: number
  fallback: number
  deadline: number
}) {
  const total = Math.max(sticky + fallback, deadline)
  const lanes: { title: string; segments: [string, number, string][] }[] = [
    {
      title: '回头设备（已有家 VM）',
      segments: [
        ['守原 VM', sticky, 'bg-primary/80 text-primary-foreground'],
        [
          '全局排队',
          fallback,
          'bg-[color:var(--status-caution-solid)] text-white',
        ],
      ],
    },
    {
      title: '新设备',
      segments: [
        [
          '全局排队',
          fallback,
          'bg-[color:var(--status-caution-solid)] text-white',
        ],
      ],
    },
  ]
  return (
    <div className='space-y-2 rounded-md border bg-muted/30 p-2.5'>
      {lanes.map((lane) => (
        <div key={lane.title} className='space-y-1'>
          <div className='text-[11px] text-muted-foreground'>{lane.title}</div>
          <div className='relative flex h-5 overflow-hidden rounded bg-muted'>
            {lane.segments.map(([label, ms, cls]) => (
              <Segment
                key={label}
                label={label}
                ms={ms}
                total={total}
                className={cls}
              />
            ))}
            <span className='ml-1 self-center text-[10px] font-semibold text-[color:var(--status-bad)]'>
              529
            </span>
            <div
              aria-hidden
              className='absolute inset-y-0 w-0.5 bg-[color:var(--status-bad-solid)]'
              style={{ left: `${Math.min(100, (deadline / total) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      <p className='text-[11px] leading-4 text-muted-foreground'>
        红线 = 总重试时限 {fmtDuration(deadline)}
        ，任何等待都不会越过它；超时返回 529 <code>
          pool_queue_timeout
        </code>{' '}
        并带 retry-after。
      </p>
    </div>
  )
}

function CircuitFlow({
  threshold,
  openMs,
}: {
  threshold: number
  openMs: number
}) {
  const step = (icon: React.ReactNode, title: string, sub: string) => (
    <div className='flex min-w-0 flex-1 flex-col items-center gap-1 text-center'>
      <div className='flex h-6 items-center'>{icon}</div>
      <div className='text-[11px] font-medium'>{title}</div>
      <div className='text-[10px] leading-3 text-muted-foreground'>{sub}</div>
    </div>
  )
  const arrow = (
    <span aria-hidden className='mt-2 text-muted-foreground'>
      →
    </span>
  )
  return (
    <div className='flex items-start gap-1 rounded-md border bg-muted/30 p-2.5'>
      {step(
        <span className='flex flex-wrap justify-center gap-0.5'>
          {Array.from({ length: Math.min(threshold, 10) }, (_, i) => (
            <span
              key={i}
              className='size-2 rounded-full bg-[color:var(--status-bad-solid)]'
            />
          ))}
          {threshold > 10 ? (
            <span className='text-[10px]'>+{threshold - 10}</span>
          ) : null}
        </span>,
        `连续 ${threshold} 次 5xx`,
        '529 / 401 不计'
      )}
      {arrow}
      {step(
        <ShieldAlert className='size-5 text-[color:var(--status-bad)]' />,
        `熔断 ${fmtDuration(openMs)}`,
        '这台 VM 退出可选集'
      )}
      {arrow}
      {step(
        <Zap className='size-5 text-[color:var(--status-caution)]' />,
        '放行 1 个探测',
        '成功即恢复，失败再熔断'
      )}
    </div>
  )
}

export function PoolPane(props: PoolPaneProps) {
  const {
    pool,
    failover,
    inference,
    onPoolChange,
    onFailoverChange,
    onInferenceChange,
  } = props
  const setPool = (patch: Obj) => onPoolChange({ ...pool, ...patch })
  const setFailover = (patch: Obj) =>
    onFailoverChange({ ...failover, ...patch })

  const strategy = pool.strategy === 'fill' ? 'fill' : 'balanced'
  const seatCap = Math.min(
    SEAT_CAP_MAX,
    Math.max(1, numOf(inference, 'session_slots', SEAT_CAP_MAX))
  )
  const queueMax = numOf(pool, 'queue_max', POOL_DEFAULTS.queue_max)
  const grace = numOf(pool, 'seat_grace_ms', POOL_DEFAULTS.seat_grace_ms)
  // 存小数、显示百分数；保留一位小数，避免 0.07 × 100 的浮点尾巴。
  const reservePct =
    Math.round(
      numOf(
        pool,
        'seat_budget_reserve_pct',
        POOL_DEFAULTS.seat_budget_reserve_pct
      ) * 1000
    ) / 10
  const sticky = numOf(
    pool,
    'sticky_wait_timeout_ms',
    POOL_DEFAULTS.sticky_wait_timeout_ms
  )
  const fallbackWait = numOf(
    pool,
    'fallback_wait_timeout_ms',
    POOL_DEFAULTS.fallback_wait_timeout_ms
  )
  const deadline = numOf(
    failover,
    'total_retry_deadline_ms',
    FAILOVER_DEFAULTS.total_retry_deadline_ms
  )
  const threshold = numOf(
    pool,
    'circuit_failure_threshold',
    POOL_DEFAULTS.circuit_failure_threshold
  )
  const openMs = numOf(pool, 'circuit_open_ms', POOL_DEFAULTS.circuit_open_ms)
  return (
    <div className='space-y-4'>
      <PoolLivePanel strategy={strategy} queueMax={queueMax} />

      <PaneSection
        icon={Layers}
        title='开席策略'
        desc='只决定「新设备落到哪台 Claude VM」。已有席位的设备继续回自己的 VM；调度等级高的 VM 永远先选，同等级才看策略，同占用比例再比配额余量。'
      >
        <StrategyCards
          value={strategy}
          onChange={(next) => setPool({ strategy: next })}
        />
        <div className='flex items-center justify-between gap-4 rounded-md border px-3 py-2.5'>
          <div className='space-y-0.5'>
            <Label htmlFor='pool-manual-wins'>手动开关优先</Label>
            <p className='text-xs leading-5 text-muted-foreground'>
              运维在 VM 上手动拨的「调度开 /
              关」不被自动逻辑改回。关掉后，额度恢复、探测成功等自动流程可以把手动关掉的
              VM 重新放回池里。
            </p>
          </div>
          <Switch
            id='pool-manual-wins'
            className='cursor-pointer'
            checked={pool.manual_schedule_wins !== false}
            onCheckedChange={(on) => setPool({ manual_schedule_wins: on })}
          />
        </div>
      </PaneSection>

      <div className='grid gap-4 xl:grid-cols-2'>
        <PaneSection
          icon={Armchair}
          title='席位'
          desc='一台设备在一台 VM 上占一个席位；同设备的并发请求共用这个席位，只受 VM 并发限制。'
        >
          <div className='space-y-2'>
            <div className='flex items-start justify-between gap-3'>
              <div className='space-y-0.5'>
                <Label>每台 VM 席位上限</Label>
                <p className='text-xs leading-5 text-muted-foreground'>
                  全局默认，即 <code>inference.session_slots</code>
                  ，最多 20（内核预开的 native 位）。VM 页单独改过的保持本槽值。
                </p>
              </div>
              <span className='shrink-0 rounded-md bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums'>
                {seatCap} 席
              </span>
            </div>
            <ChipGroup
              label='每台 VM 席位上限'
              value={seatCap}
              options={withCurrent(
                SEAT_CAP_STEPS.map((n): [number, string] => [n, String(n)]),
                seatCap
              )}
              onChange={(n) =>
                onInferenceChange({ ...inference, session_slots: n })
              }
            />
            <SeatCells used={0} max={seatCap} />
          </div>
          <SliderSetting
            id='pool-seat-grace'
            label='席位宽限'
            desc='请求结束后，席位为同一设备再保留多久；期间别的设备不能占用，同设备回来直接复用。'
            value={grace}
            min={0}
            max={120000}
            step={5000}
            format={(ms) => (ms ? fmtDuration(ms) : '不保留')}
            fallback={POOL_DEFAULTS.seat_grace_ms}
            presets={[0, 10000, 30000, 60000, 120000]}
            onChange={(ms) => setPool({ seat_grace_ms: ms })}
          />
          <SliderSetting
            id='pool-seat-reserve'
            label='每席位预算预留'
            desc='开新席位前，VM 的 min(5h 闸 − 已用, 7d 闸 − 已用) 至少要覆盖（已开席位 + 1）× 该值。'
            value={reservePct}
            min={0}
            max={50}
            step={0.5}
            format={(v) => `${v}%`}
            fallback={POOL_DEFAULTS.seat_budget_reserve_pct * 100}
            presets={[0, 1, 2, 5, 10]}
            onChange={(v) =>
              setPool({ seat_budget_reserve_pct: Math.round(v * 10) / 1000 })
            }
          >
            <BudgetStairs reservePct={reservePct} cap={seatCap} />
          </SliderSetting>
        </PaneSection>

        <PaneSection
          icon={Hourglass}
          title='排队'
          desc='席位、并发、冷却或 RPM 满了时按到达顺序排队，先到先得。'
        >
          <SliderSetting
            id='pool-queue-max'
            label='允许排队数量'
            desc='全部 Claude 排队请求的总数（VM 上 + 全局）。满了新请求直接 529，不进队。'
            value={queueMax}
            min={1}
            max={999}
            format={(n) => `${n} 个`}
            fallback={POOL_DEFAULTS.queue_max}
            presets={[10, 20, 50, 100, 200, 500]}
            onChange={(n) => setPool({ queue_max: n })}
          />
          <SliderSetting
            id='pool-sticky-wait'
            label='粘性等待'
            desc='回头设备在自己的 VM 上等席位或并发的上限，超时转去全局排队，到达顺序保留。'
            value={sticky}
            min={1000}
            max={120000}
            step={1000}
            format={fmtDuration}
            fallback={POOL_DEFAULTS.sticky_wait_timeout_ms}
            presets={[15000, 30000, 45000, 60000, 120000]}
            onChange={(ms) => setPool({ sticky_wait_timeout_ms: ms })}
          />
          <SliderSetting
            id='pool-fallback-wait'
            label='全局等待'
            desc='在全局队列里等任意 VM 空出新席位的上限，超时返回 529。'
            value={fallbackWait}
            min={1000}
            max={120000}
            step={1000}
            format={fmtDuration}
            fallback={POOL_DEFAULTS.fallback_wait_timeout_ms}
            presets={[10000, 30000, 60000, 120000]}
            onChange={(ms) => setPool({ fallback_wait_timeout_ms: ms })}
          />
          <SliderSetting
            id='pool-retry-deadline'
            label='总重试时限'
            desc='一次请求从进来到放弃（排队 + 切号重试）的总上限。'
            value={deadline}
            min={10000}
            max={600000}
            step={5000}
            format={fmtDuration}
            fallback={FAILOVER_DEFAULTS.total_retry_deadline_ms}
            presets={[60000, 120000, 300000, 600000]}
            onChange={(ms) => setFailover({ total_retry_deadline_ms: ms })}
          >
            <QueueTimeline
              sticky={sticky}
              fallback={fallbackWait}
              deadline={deadline}
            />
          </SliderSetting>
        </PaneSection>

        <PaneSection
          icon={ArrowRightLeft}
          title='重试与切号'
          desc='可重试的上游错误先换没试过的 VM；没有别的空闲 VM 才回同一台再试。'
        >
          <StepperSetting
            id='failover-same-retries'
            label='同 VM 重试'
            desc='同一台最多再试几次；空响应不受此限。同一 VM 每请求最多执行 3 次。'
            value={numOf(
              failover,
              'max_same_account_retries',
              FAILOVER_DEFAULTS.max_same_account_retries
            )}
            min={0}
            max={5}
            unit='次'
            fallback={FAILOVER_DEFAULTS.max_same_account_retries}
            onChange={(n) => setFailover({ max_same_account_retries: n })}
          />
          <StepperSetting
            id='failover-switches'
            label='切号上限'
            desc='用完后只再尝试本请求还没试过的 VM，直到总重试时限。'
            value={numOf(
              failover,
              'max_account_switches',
              FAILOVER_DEFAULTS.max_account_switches
            )}
            min={0}
            max={50}
            unit='次'
            fallback={FAILOVER_DEFAULTS.max_account_switches}
            onChange={(n) => setFailover({ max_account_switches: n })}
          />
          <StepperSetting
            id='failover-total'
            label='总尝试'
            desc='整个请求最多发几次上游；用完后不再重复同一 VM。'
            value={numOf(
              failover,
              'max_total_attempts',
              FAILOVER_DEFAULTS.max_total_attempts
            )}
            min={1}
            max={50}
            unit='次'
            fallback={FAILOVER_DEFAULTS.max_total_attempts}
            onChange={(n) => setFailover({ max_total_attempts: n })}
          />
          <SliderSetting
            id='failover-same-delay'
            label='同 VM 重试间隔'
            value={numOf(
              failover,
              'same_account_retry_delay_ms',
              FAILOVER_DEFAULTS.same_account_retry_delay_ms
            )}
            min={0}
            max={5000}
            step={100}
            format={(ms) => (ms ? fmtDuration(ms) : '立即')}
            fallback={FAILOVER_DEFAULTS.same_account_retry_delay_ms}
            presets={[0, 250, 500, 1000, 2000]}
            onChange={(ms) => setFailover({ same_account_retry_delay_ms: ms })}
          />
          <div className='space-y-2'>
            <div className='space-y-0.5'>
              <Label>401 冷却</Label>
              <p className='text-xs leading-5 text-muted-foreground'>
                OAuth 401 后该 VM 退出调度的时长，期间刷票成功会提前恢复。
              </p>
            </div>
            <ChipGroup
              label='401 冷却'
              value={numOf(
                failover,
                'oauth_401_cooldown_ms',
                FAILOVER_DEFAULTS.oauth_401_cooldown_ms
              )}
              options={[30000, 120000, 300000, 600000].map((ms) => [
                ms,
                fmtDuration(ms),
              ])}
              onChange={(ms) => setFailover({ oauth_401_cooldown_ms: ms })}
            />
          </div>
          <div className='space-y-2'>
            <div className='space-y-0.5'>
              <Label>流式交付</Label>
              <p className='text-xs leading-5 text-muted-foreground'>
                realtime：边收边转，首字最快，已开始转发后出错无法切号。verified：等上游完整结束再交付，不完整可无感切号重来，首字更慢。请求头
                <code>x-kin-delivery</code> 可单独指定。
              </p>
            </div>
            <ChipGroup
              label='流式交付'
              value={
                failover.delivery_mode === 'verified' ? 'verified' : 'realtime'
              }
              options={[
                ['realtime', 'realtime · 实时'],
                ['verified', 'verified · 校验后'],
              ]}
              onChange={(mode) => setFailover({ delivery_mode: mode })}
            />
          </div>
        </PaneSection>

        <PaneSection
          icon={ShieldAlert}
          title='熔断'
          desc='单台 Claude VM 连续出 5xx 时临时摘掉，避免把请求一直送进坏机器。'
        >
          <StepperSetting
            id='pool-circuit-threshold'
            label='熔断失败次数'
            desc='同一台 VM 连续 5xx 达到该次数后打开熔断。'
            value={threshold}
            min={1}
            max={20}
            unit='次'
            fallback={POOL_DEFAULTS.circuit_failure_threshold}
            onChange={(n) => setPool({ circuit_failure_threshold: n })}
          />
          <SliderSetting
            id='pool-circuit-open'
            label='熔断打开时长'
            desc='到期后只放行 1 个探测请求。'
            value={openMs}
            min={1000}
            max={600000}
            step={1000}
            format={fmtDuration}
            fallback={POOL_DEFAULTS.circuit_open_ms}
            presets={[10000, 30000, 60000, 120000, 300000]}
            onChange={(ms) => setPool({ circuit_open_ms: ms })}
          />
          <CircuitFlow threshold={threshold} openMs={openMs} />
        </PaneSection>
      </div>
    </div>
  )
}
