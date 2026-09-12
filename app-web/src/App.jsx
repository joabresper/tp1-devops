import { useState, useEffect } from 'react';
import { Plus, Trash2, CheckCircle, Circle } from 'lucide-react';
import './index.css';

function App() {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      const response = await fetch('/api/todos');
      if (response.ok) {
        const data = await response.json();
        setTodos(data);
      }
    } catch (error) {
      console.error('Error fetching todos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTodo = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: inputValue.trim() })
      });
      
      if (response.ok) {
        const newTodo = await response.json();
        setTodos([...todos, newTodo]);
        setInputValue('');
      }
    } catch (error) {
      console.error('Error adding todo:', error);
    }
  };

  const handleToggleComplete = async (id) => {
    try {
      const response = await fetch(`/api/todos/${id}`, { method: 'PUT' });
      if (response.ok) {
        const updatedTodo = await response.json();
        setTodos(todos.map(todo => todo.id === id ? updatedTodo : todo));
      }
    } catch (error) {
      console.error('Error toggling todo:', error);
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (response.ok) {
        setTodos(todos.filter(todo => todo.id !== id));
      }
    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  };

  return (
    <div className="app-container">
      <div className="todo-card">
        <h1>TP1 DevOps ToDo</h1>
        
        <form className="input-group" onSubmit={handleAddTodo}>
          <input 
            type="text" 
            placeholder="¿Qué necesitas hacer hoy?" 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button type="submit" className="btn-add">
            <Plus size={20} />
          </button>
        </form>

        {loading ? (
          <div className="loading">Cargando tareas...</div>
        ) : (
          <ul className="todo-list">
            {todos.length === 0 ? (
              <div className="loading">No hay tareas pendientes. ¡Disfruta tu día!</div>
            ) : (
              todos.map(todo => (
                <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                  <div className="todo-content" onClick={() => handleToggleComplete(todo.id)}>
                    {todo.completed ? (
                      <CheckCircle size={20} className="check-icon" />
                    ) : (
                      <Circle size={20} className="check-icon" />
                    )}
                    <span className="todo-text">{todo.title}</span>
                  </div>
                  <button className="btn-icon" onClick={() => handleDelete(todo.id)}>
                    <Trash2 size={18} />
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

export default App;
