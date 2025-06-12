import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import { register } from '../services/api';

const Register = ({ onRegisterSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
    if (password.length < 6) {
      toast.error('Пароль должен содержать не менее 6 символов.');
      return false;
    }
    if (password !== confirmPassword) {
      toast.error('Пароли не совпадают.');
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
      const data = await register(username, password);
      
      if (data.success) {
        toast.success('Регистрация прошла успешно!');
        onRegisterSuccess(data);
      } else {
        toast.error(data.error || 'Произошла ошибка при регистрации.');
      }
    } catch (err) {
      toast.error('Не удалось подключиться к серверу.');
      console.error(err);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-form">
        <h2>Регистрация</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Имя пользователя</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength="50"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Пароль (мин. 6 символов)</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength="6"
              disabled={loading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="confirmPassword">Подтвердите пароль</label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength="6"
              disabled={loading}
            />
          </div>
          
          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>
        
        <p style={{ marginTop: '15px' }}>
          Уже есть аккаунт? <a href="/login" className="action-link">Войти</a>
        </p>
      </div>
    </div>
  );
};

export default Register;