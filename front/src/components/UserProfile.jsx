import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { updateUser } from '../services/api';

const UserProfile = ({ user, setUser }) => {
  const [telegramId, setTelegramId] = useState('');

  useEffect(() => {
    if (user) {
      setTelegramId(user.telegram_id || '');
    }
  }, [user]);
  
  const validateForm = () => {
    if (telegramId && !/^\d+$/.test(telegramId)) {
        toast.error('Telegram ID должен состоять только из цифр.');
        return false;
    }
    return true;
  };

  const handleUpdateClick = async () => {
    if (!validateForm()) {
        return;
    }

    const payload = { telegram_id: telegramId ? parseInt(telegramId, 10) : null };

    const promise = updateUser(user.id, payload);

    toast.promise(promise, {
      loading: 'Обновление профиля...',
      success: 'Профиль успешно обновлен!',
      error: (err) => err.message || 'Произошла ошибка при обновлении.',
    });

    try {
      const response = await promise;
      if (response.success && response.user) {
        setUser({ ...user, telegram_id: response.user.telegram_id });
      }
    } catch (error) {
      console.error('Ошибка обновления профиля:', error);
    }
  };

  if (!user) {
    return <div>Загрузка профиля...</div>;
  }

  return (
    <div className="user-profile">
      <h2>Профиль пользователя</h2>
      
      <div className="form-structure">
        <div className="form-group">
          <label>Имя пользователя</label>
          <input type="text" value={user.username} disabled />
        </div>
        
        <div className="form-group">
          <label>Telegram ID</label>
          <input
            type="text"
            name="telegram_id"
            value={telegramId}
            onChange={(e) => setTelegramId(e.target.value)}
            placeholder="Введите ваш Telegram ID"
          />
        </div>
        
        <div className="actions">
          <button
            type="button"
            className="submit-btn"
            onClick={handleUpdateClick}
          >
            Обновить Telegram ID
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;