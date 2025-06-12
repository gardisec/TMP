import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { login } from '../services/api';

const Login = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const validateForm = () => {
    if (!username.trim()) {
        toast.error('Имя пользователя не может быть пустым.');
        return false;
    }
    if (username.length > 50) {
        toast.error('Имя пользователя не должно превышать 50 символов.');
        return false;
    }
    if (!password) {
        toast.error('Пароль не может быть пустым.');
        return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
        return;
    }

    setLoading(true);
    try {
      const data = await login(username, password);
      if (data.success) {
        toast.success('Вход выполнен успешно!');
        onLoginSuccess(data);
      } else {
        toast.error(data.error || 'Произошла ошибка при входе.');
      }
    } catch (err) {
      toast.error('Не удалось подключиться к серверу. Попробуйте позже.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-form">
        <h2>Вход</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Имя пользователя</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength="50"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>
        
        <p style={{marginTop: '15px'}}>
          Нет аккаунта? <a href="/register" className="action-link">Зарегистрироваться</a>
        </p>
      </div>
    </div>
  );
};

export default Login;