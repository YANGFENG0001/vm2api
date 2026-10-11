import test from 'node:test'
import assert from 'node:assert/strict'
import {
  annotatePublicLocalProxy,
  canRevealClusterNodes,
  groupLocalBoundNodes,
  localProxyNodeFields,
} from '../../src/lib/vm/local-proxy-nodes.mjs'

test('canRevealClusterNodes is admin/super only', () => {
  assert.equal(canRevealClusterNodes('admin'), true)
  assert.equal(canRevealClusterNodes('super'), true)
  assert.equal(canRevealClusterNodes('user'), false)
  assert.equal(canRevealClusterNodes(undefined), false)
})

test('groupLocalBoundNodes splits control plane from named extension nodes', () => {
  const groups = groupLocalBoundNodes({
    boundVmIds: ['vm-ctrl', 'vm-tokyo', 'vm-osaka'],
    vms: [{ id: 'vm-ctrl' }, { id: 'vm-tokyo', node_id: 'node-a' }, { id: 'vm-osaka', node_id: 'node-b' }],
    nodes: [
      { id: 'node-a', label: '东京-01' },
      { id: 'node-b', label: '大阪-02' },
    ],
    reveal: true,
  })
  assert.deepEqual(groups, [
    { node_id: null, node_name: null, bound_vm_ids: ['vm-ctrl'] },
    { node_id: 'node-a', node_name: '东京-01', bound_vm_ids: ['vm-tokyo'] },
    { node_id: 'node-b', node_name: '大阪-02', bound_vm_ids: ['vm-osaka'] },
  ])
})

test('annotatePublicLocalProxy redacts node names and other tenants for user', () => {
  const proxy = {
    id: 'px-local',
    kind: 'local',
    bound_vm_ids: ['vm-a', 'vm-b'],
    bound_count: 2,
    geo: { ip: '203.0.113.9' },
  }
  const admin = annotatePublicLocalProxy(proxy, {
    reveal: true,
    vms: [{ id: 'vm-a' }, { id: 'vm-b', node_id: 'node-a' }],
    nodes: [{ id: 'node-a', label: '东京-01' }],
  })
  assert.equal(admin.bound_nodes[1].node_name, '东京-01')
  assert.equal(admin.geo.ip, '203.0.113.9')

  const tenant = annotatePublicLocalProxy(proxy, {
    reveal: false,
    ownerVmIds: new Set(['vm-a']),
    vms: [{ id: 'vm-a' }, { id: 'vm-b', node_id: 'node-a' }],
    nodes: [{ id: 'node-a', label: '东京-01' }],
  })
  assert.deepEqual(tenant.bound_vm_ids, ['vm-a'])
  assert.equal(tenant.bound_nodes, undefined)
  assert.equal(tenant.node_name, undefined)
})

test('localProxyNodeFields omits node_name for tenants', () => {
  const nodes = [{ id: 'node-a', label: '东京-01' }]
  assert.deepEqual(localProxyNodeFields({ node_id: 'node-a' }, { role: 'admin', nodes }), {
    node_id: 'node-a',
    node_name: '东京-01',
  })
  assert.deepEqual(localProxyNodeFields({ node_id: 'node-a' }, { role: 'user', nodes }), {
    node_id: 'node-a',
  })
  assert.deepEqual(localProxyNodeFields({}, { role: 'admin', nodes }), {
    node_id: null,
    node_name: null,
  })
})
