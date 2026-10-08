import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertVmScope,
  keyAllowsVm,
  keyScopeFromRecord,
  keyScopeFromRequest,
  normalizeKeyScope,
} from '../../src/lib/admin/key-scope.mjs'

const claude = { id: 'vm-01', platform: 'anthropic' }
const codex = { id: 'vm-02', platform: 'openai', family: 'codex' }

test('all is global and ignores a stored VM list', () => {
  const scope = keyScopeFromRecord({ group_type: 'all', allowed_vms: '["vm-01"]' })
  assert.deepEqual(scope, { group_type: 'all', allowed_vms: [] })
  assert.equal(keyAllowsVm(scope, claude), true)
  assert.equal(keyAllowsVm(scope, codex), true)
  assert.deepEqual(keyScopeFromRequest({ apiKeyKind: 'master', apiKeyRecord: { group_type: 'openai' } }), {
    group_type: 'all',
    allowed_vms: [],
  })
})

test('anthropic and openai only allow checked VMs of that platform', () => {
  const scope = normalizeKeyScope({ group_type: 'anthropic', allowed_vms: ['vm-01', 'vm-01', ''] })
  assert.deepEqual(scope, { group_type: 'anthropic', allowed_vms: ['vm-01'] })
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
  })
})
