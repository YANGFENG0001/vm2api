/**
 * Managed-key schedule scope.
 * group_type all schedules every VM. anthropic/openai only schedule the checked VMs of that platform.
 * group_id (coding/other) is a rate multiplier and is not this field.
 */
import { isCodexVm } from '../vm/vm-kind.mjs'

export function vmGroupType(vm) {
  return isCodexVm(vm) ? 'openai' : 'anthropic'
}

export function parseAllowedVms(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))]
  }
  if (value == null || value === '') return []
  const text = String(value).trim()
  if (!text) return []
  if (text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parseAllowedVms(parsed)
    } catch {
      return []
    }
  }
  return [
    ...new Set(
      text
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
}

/** null when the value is present but not all/anthropic/openai. Empty uses fallback. */
export function normalizeGroupType(value, { fallback = 'all' } = {}) {
  if (value == null || value === '') return fallback
  const v = String(value).trim().toLowerCase()
  if (v === 'all') return 'all'
  if (v === 'anthropic' || v === 'claude') return 'anthropic'
  if (v === 'openai' || v === 'gpt' || v === 'codex') return 'openai'
  return null
}

export function keyScopeFromRecord(rec) {
  if (!rec) return { group_type: 'all', allowed_vms: [] }
  const group_type = normalizeGroupType(rec.group_type) || 'all'
  return {
    group_type,
    allowed_vms: group_type === 'all' ? [] : parseAllowedVms(rec.allowed_vms),
  }
}

export function keyScopeFromRequest(req) {
  if (!req || req.apiKeyKind === 'master') return { group_type: 'all', allowed_vms: [] }
  return keyScopeFromRecord(req.apiKeyRecord)
}

export function keyAllowsVm(scope, vm) {
  const group = scope?.group_type || 'all'
  if (group === 'all') return true
  if (!vm?.id) return false
  if (vmGroupType(vm) !== group) return false
  return (scope.allowed_vms || []).includes(vm.id)
}

/**
 * Write-side scope. Unknown group_type throws instead of widening to all.
 * partial + neither field → null (leave the row alone).
 * Does not check that the VM exists.
 */
export function normalizeKeyScope(input = {}, { partial = false, current = null } = {}) {
  const hasType = input.group_type != null && input.group_type !== ''
  const hasVms = input.allowed_vms != null
  if (partial && !hasType && !hasVms) return null

  const base = current ? keyScopeFromRecord(current) : { group_type: 'all', allowed_vms: [] }
  let group_type = !partial && !hasType ? 'all' : base.group_type
  if (hasType) {
    const parsed = normalizeGroupType(input.group_type, { fallback: null })
    if (!parsed) {
      throw Object.assign(new Error('group_type 只能是 all、anthropic 或 openai'), { code: 'invalid_group_type' })
    }
    group_type = parsed
  }
  let allowed_vms = hasVms ? parseAllowedVms(input.allowed_vms) : !partial && !hasType ? [] : base.allowed_vms
  if (group_type === 'all') allowed_vms = []
  if (group_type !== 'all' && allowed_vms.length === 0) {
    throw Object.assign(new Error('选择 anthropic 或 openai 时至少勾选一台 VM'), { code: 'key_vms_required' })
  }
  return { group_type, allowed_vms }
}

/** Panel check: every id is a live VM of the chosen platform. */
export function assertVmScope(vms, scope) {
  if (!scope || scope.group_type === 'all') return []
  const byId = new Map((vms || []).map((vm) => [vm.id, vm]))
  for (const id of scope.allowed_vms) {
    const vm = byId.get(id)
    if (!vm) throw Object.assign(new Error('所选 VM 不存在'), { code: 'key_vm_unknown' })
    if (vmGroupType(vm) !== scope.group_type) {
      throw Object.assign(new Error('所选 VM 不属于该分组'), { code: 'key_vm_mismatch' })
    }
  }
  return scope.allowed_vms
}
