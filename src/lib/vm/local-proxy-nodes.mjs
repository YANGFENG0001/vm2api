/**
 * Display grouping for the shared px-local record.
 *
 * Quota stays one bind_limit across every node. These helpers only attach
 * placement labels so the panel can say which VPS a bound slot actually exits
 * from. Per-node capacity is a different decision (see #330).
 */

export function canRevealClusterNodes(role) {
  const r = String(role || '')
    .trim()
    .toLowerCase()
  return r === 'admin' || r === 'super'
}

export function clusterNodeDisplayName(node) {
  const label = String(node?.label || '').trim()
  return label || null
}

export function nodeNameOf(nodes, nodeId) {
  if (!nodeId) return null
  const id = String(nodeId)
  const node = (nodes || []).find((item) => item && String(item.id) === id)
  return clusterNodeDisplayName(node)
}

export function vmNodeIdOf(vm) {
  const id = String(vm?.node_id || '').trim()
  return id || null
}

function boundIdsOf(proxy) {
  if (Array.isArray(proxy?.bound_vm_ids) && proxy.bound_vm_ids.length) {
    return proxy.bound_vm_ids.map((id) => String(id || '').trim()).filter(Boolean)
  }
  const single = String(proxy?.bound_vm_id || '').trim()
  return single ? [single] : []
}

/**
 * Group bound VM ids by the slot's placement node. Control plane uses
 * `node_id: null`. `node_name` is only filled when `reveal` is true.
 */
export function groupLocalBoundNodes({ boundVmIds = [], vms = [], nodes = [], reveal = false } = {}) {
  const vmById = new Map((vms || []).map((vm) => [String(vm.id), vm]))
  const groups = new Map()
  for (const rawId of boundVmIds || []) {
    const id = String(rawId || '').trim()
    if (!id) continue
    const nodeId = vmNodeIdOf(vmById.get(id))
    const key = nodeId || ''
    let group = groups.get(key)
    if (!group) {
      group = { node_id: nodeId, bound_vm_ids: [] }
      if (reveal) group.node_name = nodeId ? nodeNameOf(nodes, nodeId) : null
      groups.set(key, group)
    }
    group.bound_vm_ids.push(id)
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.node_id && b.node_id) return -1
    if (a.node_id && !b.node_id) return 1
    return String(a.node_id || '').localeCompare(String(b.node_id || ''))
  })
}

function isLocalProxy(proxy) {
  if (!proxy || typeof proxy !== 'object') return false
  const id = String(proxy.id || '')
    .trim()
    .toLowerCase()
  const scheme = String(proxy.scheme || proxy.kind || '')
    .trim()
    .toLowerCase()
  const host = String(proxy.host || '')
    .trim()
    .toLowerCase()
  return id === 'px-local' || scheme === 'local' || host === 'local'
}

/**
 * Shape a public proxy row for the panel. Local stays one record; admin sees
 * per-node bound groups, tenants keep their own VM ids and no node names.
 */
export function annotatePublicLocalProxy(proxy, { reveal = false, vms = [], nodes = [], ownerVmIds = null } = {}) {
  if (!proxy) return proxy
  if (!isLocalProxy(proxy)) {
    if (reveal) return proxy
    const out = { ...proxy }
    delete out.node_name
    delete out.bound_nodes
    return out
  }
  let ids = boundIdsOf(proxy)
  if (ownerVmIds) {
    ids = ids.filter((id) => ownerVmIds.has(String(id)))
    if (!ids.length) return null
  }
  const out = {
    ...proxy,
    bound_vm_ids: ids,
    bound_vm_id: ids[0] || null,
    bound_count: ids.length,
  }
  // Shared px-local is not one node's exit; placement lives on bound_nodes / the VM.
  delete out.node_id
  delete out.node_name
  if (reveal) {
    out.bound_nodes = groupLocalBoundNodes({ boundVmIds: ids, vms, nodes, reveal: true })
  } else {
    delete out.bound_nodes
  }
  return out
}

export function localProxyNodeFields(vm, { role, nodes = [] } = {}) {
  const nodeId = vmNodeIdOf(vm)
  if (!canRevealClusterNodes(role)) return { node_id: nodeId }
  return { node_id: nodeId, node_name: nodeId ? nodeNameOf(nodes, nodeId) : null }
}
