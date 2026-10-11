import type { Vm } from '@/types/panel-vm'
import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  localProxyOptsFromProxy,
  proxyHostLabel,
  proxyNamedLabel,
} from '@/lib/vm-status'
import { proxyIsLocal } from '@/features/proxies/proxy-sort'
import { proxySurfaceClass, vmProxyTone } from '@/features/proxies/proxy-tone'
import { useLocalProxyLabelOpts } from '@/features/proxies/use-vps-ip'

function latencyDigits(ms: number): string {
  const n = Math.round(ms)
  if (n > 999) return '999+'
  return String(n)
}

export function ProxyChip({
  vm,
  className,
  compact = false,
}: {
  vm: Vm
  className?: string
  compact?: boolean
}) {
  const fallback = useLocalProxyLabelOpts(vm.node_id)
  const opts = localProxyOptsFromProxy(vm.proxy, fallback)
  const host = proxyHostLabel(vm.proxy, opts)
  const tone = vmProxyTone(vm)
  const blocked = vm.proxy?.blocked_reason === 'ipv6_disabled'
  const nodeLocal = !!(vm.proxy && proxyIsLocal(vm.proxy) && vm.node_id)
  const lat = blocked || nodeLocal ? null : vm.proxy?.latency_ms
  const bound = host !== '—'
  const named = proxyNamedLabel(vm.proxy, opts)
  const label = bound
    ? vm.proxy?.label?.trim() || host
    : tone === 'danger'
      ? '缺代理'
      : '直连'
  const title = blocked
    ? `${named} · IPv6 已关闭（设置 → SOCKS5 开启）`
    : nodeLocal
      ? `${named} · 出口为该节点本机`
      : lat != null && bound
        ? `${named} · ${lat}ms`
        : bound
          ? named
          : label

  return (
    <div
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5',
        proxySurfaceClass(tone),
        !bound &&
          tone === 'none' &&
          'border border-dashed border-border/80 bg-transparent',
        className
      )}
      title={title}
    >
      {bound ? (
        <>
          <Globe className='size-3 shrink-0' aria-hidden />
          {compact ? null : (
            <span className='field-host truncate text-xs'>{host}</span>
          )}
          {blocked ? (
            <span className='shrink-0 text-[11px] text-muted-foreground'>
              IPv6 已关闭
            </span>
          ) : null}
          {compact && !blocked && vm.proxy && proxyIsLocal(vm.proxy) ? (
            // local 出口只有一条共用记录：必须写明是哪台 VPS 的本机出口。
            <span className='truncate text-[11px]'>{host}</span>
          ) : null}
          {lat != null ? (
            <span className='field-metric shrink-0 text-[11px] tabular-nums'>
              {latencyDigits(lat)}
            </span>
          ) : compact && !blocked && !(vm.proxy && proxyIsLocal(vm.proxy)) ? (
            <span className='text-[11px]'>{tone === 'ok' ? '通' : '未测'}</span>
          ) : null}
        </>
      ) : (
        <span className='text-[11px]'>
          {compact ? (tone === 'danger' ? '缺' : '直') : label}
        </span>
      )}
    </div>
  )
}
