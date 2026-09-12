import { useEffect, useState } from 'react'
import './App.css'

async function request(path, options, onInstance) {
  const response = await fetch(`/api/tareas${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
  })
  if (!options.signal?.aborted) onInstance(response.headers.get('X-API-Instance'))
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.error || 'No se pudo completar la operación. Intentá nuevamente.')
  }
  return response.status === 204 ? null : response.json()
}

function App() {
  const [tasks, setTasks] = useState([])
  const [title, setTitle] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [apiInstance, setApiInstance] = useState(null)
  const frontendInstance = document.querySelector('meta[name="frontend-instance"]')?.content || 'No disponible'

  useEffect(() => {
    const controller = new AbortController()
    request('', { signal: controller.signal }, setApiInstance)
      .then(setTasks)
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [])

  async function refresh() {
    setLoading(true)
    setError('')
    setApiInstance(null)
    try {
      setTasks(await request('', {}, setApiInstance))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function mutate(path, method, body) {
    setBusy(true)
    setError('')
    setApiInstance(null)
    try {
      const task = await request(path, { method, body: body && JSON.stringify(body) }, setApiInstance)
      setTasks((current) => method === 'POST'
        ? [...current, task]
        : method === 'DELETE'
          ? current.filter((item) => `/${item.id}` !== path)
          : current.map((item) => item.id === task.id ? task : item))
      return true
    } catch (err) {
      setError(err.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  function cancelEditing() {
    setEditingId(null)
    setTitle('')
  }

  async function save(event) {
    event.preventDefault()
    const current = tasks.find((task) => task.id === editingId)
    const saved = await mutate(editingId ? `/${editingId}` : '', editingId ? 'PUT' : 'POST', {
      title: title.trim(),
      completed: current?.completed ?? false,
    })
    if (saved) cancelEditing()
  }

  const disabled = loading || busy
  const completed = tasks.filter((task) => task.completed).length

  return (
    <main>
      <header>
        <p className="eyebrow">TP1 · DevOps</p>
        <h1>Mis tareas</h1>
        <p>Organizá tus pendientes, de a una tarea a la vez.</p>
      </header>

      <aside className="instances" aria-label="Instancias del sistema">
        <div><span>Frontend que sirvió la página</span><code>{frontendInstance}</code></div>
        <div><span>API de la última petición</span><code aria-live="polite">{apiInstance || (disabled ? 'Consultando…' : 'Sin respuesta identificada')}</code></div>
        <p>Usá Actualizar o modificá una tarea para ver qué API responde. Recargá la página para consultar otro frontend.</p>
      </aside>

      <form onSubmit={save}>
        <label htmlFor="task-title">{editingId ? 'Editar tarea' : 'Nueva tarea'}</label>
        <div className="form-row">
          <input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)}
            placeholder="¿Qué tenés que hacer?" maxLength={200} required disabled={disabled} />
          <button disabled={disabled || !title.trim()}>{editingId ? 'Guardar' : 'Agregar'}</button>
          {editingId && <button type="button" className="secondary" onClick={cancelEditing} disabled={disabled}>Cancelar</button>}
        </div>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      <section aria-label="Lista de tareas" aria-busy={disabled}>
        <div className="list-heading">
          <p role="status">{loading ? 'Cargando tareas…' : `${completed} de ${tasks.length} completadas`}</p>
          <button type="button" className="secondary" onClick={refresh} disabled={disabled}>Actualizar</button>
        </div>
        {!loading && !error && tasks.length === 0 && <p className="empty">Todavía no hay tareas. Agregá la primera.</p>}
        <ul>
          {[...tasks].sort((a, b) => a.title.localeCompare(b.title, 'es')).map((task) => (
            <li key={task.id}>
              <label className="task-label">
                <input type="checkbox" checked={task.completed} disabled={disabled || editingId === task.id}
                  onChange={() => mutate(`/${task.id}`, 'PUT', { title: task.title, completed: !task.completed })} />
                <span className={task.completed ? 'completed' : ''}>{task.title}</span>
              </label>
              <div className="actions">
                <button type="button" className="secondary" disabled={disabled}
                  aria-label={`Editar ${task.title}`} onClick={() => {
                    setEditingId(task.id)
                    setTitle(task.title)
                    document.getElementById('task-title').focus()
                  }}>Editar</button>
                <button type="button" className="danger" disabled={disabled}
                  aria-label={`Eliminar ${task.title}`} onClick={async () => {
                    if (await mutate(`/${task.id}`, 'DELETE') && editingId === task.id) cancelEditing()
                  }}>Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

export default App
