import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyVmPool,
  assertVmScope,
  keyAllowsVm,
  keyScopeFromRecord,
  keyScopeFromRequest,
  normalizeKeyScope,
  resolveBackendForScope,
  vmAllowedForScopes,
  vmPoolDenial,
} from '../../src/lib/admin/key-scope.mjs'

const claude = { id: 'vm-01', platform: 'anthropic' }
const codex = { id: 'vm-02', platform: 'openai', family: 'codex' }

test('all is global and ignores a stored VM list', () => {
  const scope = keyScopeFromRecord({ group_type: 'all', allowed_vms: '["vm-01"]' })
  assert.deepEqual(scope, { group_type: 'all', allowed_vms: [], vm_pool_id: null })
  assert.equal(keyAllowsVm(scope, claude), true)
  assert.equal(keyAllowsVm(scope, codex), true)
  assert.deepEqual(keyScopeFromRequest({ apiKeyKind: 'master', apiKeyRecord: { group_type: 'openai' } }), {
    group_type: 'all',
    allowed_vms: [],
    vm_pool_id: null,
  })
})

test('anthropic and openai only allow checked VMs of that platform', () => {
  const scope = normalizeKeyScope({ group_type: 'anthropic', allowed_vms: ['vm-01', 'vm-01', ''] })
  assert.deepEqual(scope, { group_type: 'anthropic', allowed_vms: ['vm-01'], vm_pool_id: null })
  assert.equal(keyAllowsVm(scope, claude), true)
  assert.equal(keyAllowsVm(scope, codex), false)
  assert.equal(keyAllowsVm({ group_type: 'openai', allowed_vms: ['vm-02'] }, claude), false)
  assert.equal(keyAllowsVm({ group_type: 'openai', allowed_vms: ['vm-02'] }, codex), true)
})

test('a platform group cannot be saved with zero VMs or the wrong platform', () => {
  assert.throws(() => normalizeKeyScope({ group_type: 'openai', allowed_vms: [] }), /至少勾选一台 VM/)
  assert.throws(() => normalizeKeyScope({ group_type: 'nope' }), /group_type/)
  assert.throws(() => assertVmScope([claude], { group_type: 'anthropic', allowed_vms: ['missing'] }), /不存在/)
  assert.throws(() => assertVmScope([codex], { group_type: 'anthropic', allowed_vms: ['vm-02'] }), /不属于该分组/)
  assert.deepEqual(assertVmScope([claude, codex], { group_type: 'openai', allowed_vms: ['vm-02'] }), ['vm-02'])
})

test('a status-only patch does not widen or clear an existing scope', () => {
  const current = { group_type: 'anthropic', allowed_vms: '["vm-01"]' }
  assert.equal(normalizeKeyScope({ status: 'disabled' }, { partial: true, current }), null)
  assert.deepEqual(normalizeKeyScope({ group_type: 'all' }, { partial: true, current }), {
    group_type: 'all',
    allowed_vms: [],
    vm_pool_id: null,
  })
})

test('a named pool is the only schedule set and a dead pool does not widen', () => {
  const bound = normalizeKeyScope({ vm_pool_id: 'pool_abcd1234', group_type: 'all' })
  assert.deepEqual(bound, { group_type: 'all', allowed_vms: [], vm_pool_id: 'pool_abcd1234' })
  const live = applyVmPool(bound, () => ({ id: 'pool_abcd1234', enabled: true, vm_ids: ['vm-02'] }))
  assert.equal(keyAllowsVm(live, codex), true)
  assert.equal(keyAllowsVm(live, claude), false)
  const moved = applyVmPool(bound, () => ({ id: 'pool_abcd1234', enabled: true, vm_ids: ['vm-01'] }))
  assert.equal(keyAllowsVm(moved, codex), false)
  assert.equal(keyAllowsVm(moved, claude), true)
  for (const vm_pool_error of ['missing', 'disabled', 'empty']) {
    const dead = applyVmPool(bound, () =>
      vm_pool_error === 'missing' ? null : { enabled: vm_pool_error !== 'disabled', vm_ids: [] },
    )
    assert.equal(dead.vm_pool_error, vm_pool_error)
    assert.equal(keyAllowsVm(dead, claude), false)
    assert.equal(keyAllowsVm(dead, codex), false)
    assert.equal(vmPoolDenial(dead).code, 'vm_pool_unavailable')
  }
  const replaced = normalizeKeyScope(
    { group_type: 'anthropic', allowed_vms: ['vm-01'] },
    { partial: true, current: { group_type: 'all', vm_pool_id: 'pool_abcd1234' } },
  )
  assert.equal(replaced.vm_pool_id, null)
  assert.deepEqual(replaced.allowed_vms, ['vm-01'])
})

test('a slot-scoped key never runs on the API-direct backend', () => {
  // api-kernel picks endpoints and bypasses poolScheduler: keeping "api" for a
  // key that named a pool or a platform allowlist silently widens it to the
  // whole platform.
  const pool = keyScopeFromRecord({ group_type: 'all', vm_pool_id: 'pool_abcd1234' })
  assert.equal(resolveBackendForScope('api', pool), 'slot')
  const listed = keyScopeFromRecord({ group_type: 'anthropic', allowed_vms: ['vm-01'] })
  assert.equal(resolveBackendForScope('api', listed), 'slot')
  const global = keyScopeFromRecord({ group_type: 'all' })
  assert.equal(resolveBackendForScope('api', global), 'api')
  assert.equal(resolveBackendForScope('slot', pool), 'slot')
  assert.equal(resolveBackendForScope('api', null), 'api')
})

test('slot admission applies the owner scope as well as the key scope', () => {
  const platformVm = { id: 'vm-01', platform: 'anthropic', owner_user_id: null }
  const tenantVm = { id: 'vm-02', platform: 'anthropic', owner_user_id: 'u1' }
  const otherVm = { id: 'vm-03', platform: 'anthropic', owner_user_id: 'u2' }
  const globalKey = keyScopeFromRecord({ group_type: 'all' })

  const tenant = { type: 'user', userId: 'u1' }
  assert.equal(vmAllowedForScopes(tenantVm, { ownerScope: tenant, keyScope: globalKey }), true)
  assert.equal(vmAllowedForScopes(platformVm, { ownerScope: tenant, keyScope: globalKey }), false)
  assert.equal(vmAllowedForScopes(otherVm, { ownerScope: tenant, keyScope: globalKey }), false)

  // A pool narrows further: membership still has to contain the slot.
  const pooled = applyVmPool(keyScopeFromRecord({ vm_pool_id: 'pool_abcd1234' }), () => ({
    enabled: true,
    vm_ids: ['vm-02'],
  }))
  assert.equal(vmAllowedForScopes(tenantVm, { ownerScope: tenant, keyScope: pooled }), true)
  assert.equal(vmAllowedForScopes(otherVm, { ownerScope: tenant, keyScope: pooled }), false)

  // Platform keys keep the pool scope and reach the whole fleet, tenant slots
  // included — 分配只决定面板可见性，不封锁平台密钥的容量。
  const platform = { type: 'platform' }
  assert.equal(vmAllowedForScopes(platformVm, { ownerScope: platform, keyScope: globalKey }), true)
  assert.equal(vmAllowedForScopes(tenantVm, { ownerScope: platform, keyScope: globalKey }), true)
  // Still bounded by the key's own pool: a platform key that named a pool only
  // schedules that pool's members.
  assert.equal(vmAllowedForScopes(otherVm, { ownerScope: platform, keyScope: pooled }), false)
})
