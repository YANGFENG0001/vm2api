import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildVmList } from '../../src/lib/admin/panel-api.mjs'

/** A slot record owned by a tenant must survive the list projection. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-list-owner-'))
  fs.mkdirSync(path.join(root, 'vms'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'vms', 'vm-01.json'),
    JSON.stringify({
      id: 'vm-01',
      name: 'assigned',
      status: 'running',
      kernel: 'claude',
      owner_user_id: 'user-1',
      origin: 'admin_assigned',
      policy: {},
    }),
  )
  fs.writeFileSync(
    path.join(root, 'vms', 'vm-02.json'),
    JSON.stringify({
      id: 'vm-02',
      name: 'platform',
      status: 'running',
      kernel: 'claude',
      policy: {},
    }),
  )
  return root
}

test('the VM list carries owner_user_id and origin for every slot', async () => {
  const project = fixture()
  try {
    const list = await buildVmList({
      cfg: { paths: { project, data: project } },
      routingConfig: {},
      role: 'admin',
      ownerUserId: null,
    })
    const byId = new Map((list.data?.items || []).map((vm) => [vm.id, vm]))
    assert.equal(byId.get('vm-01').owner_user_id, 'user-1')
    assert.equal(byId.get('vm-01').origin, 'admin_assigned')
    assert.equal(byId.get('vm-02').owner_user_id, null)
    assert.equal(byId.get('vm-02').origin, 'platform')
  } finally {
    fs.rmSync(project, { recursive: true, force: true })
  }
})
