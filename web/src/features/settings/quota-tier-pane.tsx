import { useQuery } from '@tanstack/react-query'
import type { QuotaTierKey, QuotaTierPolicy, Vm } from '@/types/panel-vm'
import {
  CalendarClock,
  Clock3,
  Gauge,
  SplitSquareHorizontal,
} from 'lucide-react'
import { usedPctOf } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isCodexVm } from '@/lib/vm-kind'
import { claudeTier } from '@/lib/vm-status'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { GateBar } from '@/components/scheduler-viz'
import { vmsListQueryOptions } from '@/features/vm/queries'
import {
  CONC_STEPS,
  RPM_STEPS,
  withCurrent,
} from '@/features/vm/scheduling-steps'
import { ChipGroup, PaneSection, SliderSetting } from './scheduler-controls'

type Obj = Record<string, unknown>

const TIERS: { key: QuotaTierKey; label: string; hint: string }[] = [
  {
    key: 'default',
    label: '默认',
    hint: '还没探测出套餐的账号（无凭证 / 未知）',
  },
  { key: 'pro', label: 'Pro', hint: 'Fable 被套餐拒绝的账号' },
  { key: 'max', label: 'Max', hint: 'Fable 可用的账号' },
]

/** 与后端 quota-tiers.mjs DEFAULT_TIERS 一致。 */
const TIER_DEFAULTS: Record<
  QuotaTierKey,
  Required<Pick<QuotaTierPolicy, 'max_concurrency' | 'limit_5h' | 'limit_7d'>>
> = {
  default: { max_concurrency: 2, limit_5h: 0.85, limit_7d: 0.8 },
  pro: { max_concurrency: 2, limit_5h: 0.85, limit_7d: 0.8 },
  max: { max_concurrency: 4, limit_5h: 0.95, limit_7d: 0.95 },
}

/** 闸线按 5 个点向下取整到 30–100%，与后端 clampRatio 的显示口径一致。 */
function snapRatio(v: unknown, fallback: number): number {
  const n = Number(v)
  const base = Number.isFinite(n) ? n : fallback
  return Math.floor((Math.min(1, Math.max(0.3, base)) * 100) / 5) * 5
}

function tierKeyOf(vm: Vm): QuotaTierKey {
  const key = claudeTier(vm).key
  return key === 'pro' || key === 'max' ? key : 'default'
}

function ToggleCard({
  id,
  icon: Icon,
  title,
  desc,
  checked,
  onChange,
  badge,
}: {
  id: string
  icon: typeof Clock3
  title: string
  desc: string
  checked: boolean
  onChange: (on: boolean) => void
  badge?: string
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border p-3 transition-colors duration-150',
        checked ? 'border-primary/40 bg-primary/5' : 'bg-muted/30'
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4 shrink-0',
          checked ? 'text-primary' : 'text-muted-foreground'
        )}
        aria-hidden
      />
      <div className='min-w-0 flex-1 space-y-1'>
        <div className='flex items-center justify-between gap-2'>
          <Label htmlFor={id} className='cursor-pointer'>
            {title}
            {badge ? (
              <Badge variant='outline' className='ml-1.5 px-1 py-0 text-[10px]'>
                {badge}
              </Badge>
            ) : null}
          </Label>
          <Switch
            id={id}
            className='cursor-pointer'
            checked={checked}
            onCheckedChange={onChange}
          />
        </div>
        <p className='text-xs leading-5 text-muted-foreground'>{desc}</p>
      </div>
    </div>
  )
}

function TierColumn({
  tier,
  policy,
  defaultRpm,
  vms,
  block5,
  block7,
  onChange,
}: {
  tier: (typeof TIERS)[number]
  policy: QuotaTierPolicy
  defaultRpm: number
  vms: Vm[]
  block5: boolean
  block7: boolean
  onChange: (next: QuotaTierPolicy) => void
}) {
  const fallback = TIER_DEFAULTS[tier.key]
  const set = (patch: QuotaTierPolicy) => onChange({ ...policy, ...patch })
  const limit5h = snapRatio(policy.limit_5h, fallback.limit_5h)
  const limit7d = snapRatio(policy.limit_7d, fallback.limit_7d)
  const conc = Number(policy.max_concurrency ?? fallback.max_concurrency)
  const rpm = Number(policy.max_rpm ?? defaultRpm)
  const dots5 = vms.map((vm) => ({
    id: vm.id,
    label: vm.name || vm.id,
    value: usedPctOf(vm, '5h'),
  }))
  const dots7 = vms.map((vm) => ({
    id: vm.id,
    label: vm.name || vm.id,
    value: usedPctOf(vm, '7d'),
  }))
  const over5 = dots5.filter((d) => d.value >= limit5h).length
  const over7 = dots7.filter((d) => d.value >= limit7d).length
  const ratioFormat = (p: number) => `${p}%`

  return (
    <section className='flex flex-col rounded-xl border bg-card shadow-sm'>
      <header className='flex items-start justify-between gap-2 border-b px-4 py-3'>
        <div className='min-w-0'>
          <h3 className='text-sm font-semibold'>{tier.label}</h3>
          <p className='text-xs leading-5 text-muted-foreground'>{tier.hint}</p>
        </div>
        <Badge variant='secondary' className='shrink-0 tabular-nums'>
          {vms.length} 台
        </Badge>
      </header>
      <div className='flex flex-1 flex-col gap-5 px-4 py-4'>
        <SliderSetting
          id={`tier-${tier.key}-5h`}
          label='5h 闸线'
          value={limit5h}
          min={30}
          sliderClassName='ml-[30%] w-[70%]'
          max={100}
          step={5}
          format={ratioFormat}
          fallback={fallback.limit_5h * 100}
          onChange={(p) => set({ limit_5h: p / 100 })}
        >
          <GateBar gate={limit5h} dots={dots5} enabled={block5} />
          <p className='text-[11px] text-muted-foreground'>
            {vms.length
              ? `点 = 本档 VM 当前 5h 用量${over5 ? `，${over5} 台已过闸` : ''}`
              : '本档暂无 VM'}
          </p>
        </SliderSetting>
        <SliderSetting
          id={`tier-${tier.key}-7d`}
          label='7d 闸线'
          value={limit7d}
          min={30}
          sliderClassName='ml-[30%] w-[70%]'
          max={100}
          step={5}
          format={ratioFormat}
          fallback={fallback.limit_7d * 100}
          onChange={(p) => set({ limit_7d: p / 100 })}
        >
          <GateBar gate={limit7d} dots={dots7} enabled={block7} />
          <p className='text-[11px] text-muted-foreground'>
            {vms.length
              ? `点 = 本档 VM 当前 7d 用量${over7 ? `，${over7} 台已过闸` : ''}`
              : '本档暂无 VM'}
          </p>
        </SliderSetting>
        <div className='space-y-2'>
          <div className='flex items-baseline justify-between'>
            <Label>账号并发</Label>
            <span className='text-xs text-muted-foreground'>
              同一 VM 同时在飞的请求
            </span>
          </div>
          <ChipGroup
            label={`${tier.label} 账号并发`}
            value={conc}
            options={withCurrent(
              CONC_STEPS.filter(([v]) => v > 0),
              conc
            )}
            onChange={(v) => set({ max_concurrency: v })}
          />
        </div>
        <div className='space-y-2'>
          <div className='flex items-baseline justify-between'>
            <Label>账号 RPM</Label>
            <span className='text-xs text-muted-foreground'>
              满了排队，不切号
            </span>
          </div>
          <ChipGroup
            label={`${tier.label} 账号 RPM`}
            value={rpm}
            options={withCurrent(RPM_STEPS, rpm)}
            onChange={(v) => set({ max_rpm: v })}
          />
        </div>
      </div>
    </section>
  )
}

export function QuotaTierPane({
  tiers,
  defaultRpm = 0,
  quota,
  onChange,
  onQuotaChange,
}: {
  tiers: Record<string, QuotaTierPolicy>
  defaultRpm?: number
  quota: Obj
  onChange: (tier: QuotaTierKey, next: QuotaTierPolicy) => void
  onQuotaChange: (next: Obj) => void
}) {
  const list = useQuery(vmsListQueryOptions(5000))
  const byTier: Record<QuotaTierKey, Vm[]> = { default: [], pro: [], max: [] }
  for (const vm of list.data?.items || []) {
    if (!isCodexVm(vm)) byTier[tierKeyOf(vm)].push(vm)
  }
  const block5 = quota.block_on_5h !== false
  const block7 = quota.block_on_7d !== false
  const split = (quota.weekly_split as Obj | undefined) || {}

  return (
    <div className='space-y-4'>
      <PaneSection
        icon={Gauge}
        title='配额闸'
        desc={
          <>
            用量到闸线时这台 VM
            写成「受限」并切号，窗口重置后自动回池，不会拨成调度关。闸线同时决定预调度的余量：余量
            = min(5h 闸 − 已用, 7d 闸 − 已用)，开新席位要覆盖（已开席位 + 1）×
            每席位预算预留（账号池 → 席位）。
          </>
        }
      >
        <div className='grid gap-3 md:grid-cols-3'>
          <ToggleCard
            id='quota-block-5h'
            icon={Clock3}
            title='5h 闸生效'
            desc='5h 用量过闸线，或官方已拒绝 5h，就受限并切走。关掉后不按 5h 拦截。'
            checked={block5}
            onChange={(on) => onQuotaChange({ ...quota, block_on_5h: on })}
          />
          <ToggleCard
            id='quota-block-7d'
            icon={CalendarClock}
            title='7d 闸生效'
            desc='7d 用量过闸线，或官方已拒绝 7d，就受限并切走。关掉后不按 7d 拦截。'
            checked={block7}
            onChange={(on) => onQuotaChange({ ...quota, block_on_7d: on })}
          />
          <ToggleCard
            id='quota-weekly-split'
            icon={SplitSquareHorizontal}
            title='周仓拆分'
            badge='实验'
            desc='7d 额度一半留给 Fable：普通模型用完自己那一半后，这台只接 Fable 请求。'
            checked={split.enabled === true}
            onChange={(on) =>
              onQuotaChange({
                ...quota,
                weekly_split: { ...split, enabled: on, fable_share: 0.5 },
              })
            }
          />
        </div>
      </PaneSection>

      <div className='grid gap-4 lg:grid-cols-3'>
        {TIERS.map((tier) => (
          <TierColumn
            key={tier.key}
            tier={tier}
            policy={tiers[tier.key] || {}}
            defaultRpm={defaultRpm}
            vms={byTier[tier.key]}
            block5={block5}
            block7={block7}
            onChange={(next) => onChange(tier.key, next)}
          />
        ))}
      </div>
      <p className='text-xs leading-5 text-muted-foreground'>
        保存后并发 / RPM 立即推到本档所有 VM；在 VM
        页「调度配置」里单独改过的项保持本槽值，可在那里改回跟随。GPT
        槽位不走这里的分档。
      </p>
    </div>
  )
}
