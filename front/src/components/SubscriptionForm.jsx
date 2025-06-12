import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { 
  fetchComponentTypes, 
  subscribeToComponentType, 
  unsubscribeFromComponentType,
  fetchUserSubscriptions 
} from '../services/api';

const SubscriptionForm = ({ user }) => {
  const [componentTypes, setComponentTypes] = useState([]);
  const [selectedTypeName, setSelectedTypeName] = useState('');
  const [subscribedIds, setSubscribedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [typesResponse, subsResponse] = await Promise.all([
        fetchComponentTypes(),
        fetchUserSubscriptions()
      ]);
      setComponentTypes(typesResponse.component_types || []);
      setSubscribedIds(new Set(subsResponse.subscribed_type_ids || []));
    } catch (error) {
      console.error("Ошибка загрузки данных подписок:", error);
      toast.error(error.message || 'Не удалось загрузить данные страницы.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubscribe = async () => {
    if (!user.telegram_id) {
        toast.error('Пожалуйста, укажите ваш Telegram ID в профиле.');
        return;
    }
    const selectedType = componentTypes.find(type => type.name === selectedTypeName);
    if (!selectedType) return;

    const promise = subscribeToComponentType({ component_type_name: selectedTypeName });
    
    toast.promise(promise, {
       loading: 'Подписываемся...',
       success: `Вы успешно подписались на "${selectedTypeName}"`,
       error: (err) => err.message || 'Произошла ошибка при подписке.',
    });

    try {
        await promise;
        await loadData();
    } catch (err) {
        console.error("Ошибка подписки:", err);
    }
  };

  const handleUnsubscribe = async () => {
    const selectedType = componentTypes.find(type => type.name === selectedTypeName);
    if (!selectedType) return;

    const promise = unsubscribeFromComponentType({ component_type_id: selectedType.id });

    toast.promise(promise, {
       loading: 'Отписываемся...',
       success: `Вы успешно отписались от "${selectedTypeName}"`,
       error: (err) => err.message || 'Произошла ошибка при отписке.',
    });
    
    try {
        await promise;
        await loadData();
    } catch (err) {
        console.error("Ошибка отписки:", err);
    }
  };
  
  const selectedTypeObject = componentTypes.find(type => type.name === selectedTypeName);
  const isSubscribed = selectedTypeObject ? subscribedIds.has(selectedTypeObject.id) : false;

  return (
    <div className="subscription-form">
      <h2>Управление подписками на уведомления</h2>
      
      <div className="subscription-controls">
        <div className="form-group">
          <label>Выберите тип компонента для управления:</label>
          <select 
            value={selectedTypeName} 
            onChange={(e) => setSelectedTypeName(e.target.value)}
            disabled={loading}
          >
            <option value="">{loading ? 'Загрузка...' : 'Выберите тип...'}</option>
            {componentTypes.map(type => (
              <option key={type.id} value={type.name}>{type.name}</option>
            ))}
          </select>
        </div>
        
        {selectedTypeName && (
            <div className="action-buttons horizontal">
                <button 
                    onClick={handleSubscribe} 
                    className="submit-btn" 
                    disabled={isSubscribed}
                >
                    Подписаться
                </button>
                <button 
                    onClick={handleUnsubscribe} 
                    className="delete-btn" 
                    disabled={!isSubscribed}
                >
                    Отписаться
                </button>
            </div>
        )}
      </div>

      <div className="subscriptions-table-container">
        <h3 style={{ marginTop: '40px' }}>Ваши подписки</h3>
        {loading ? (
          <p>Загрузка списка подписок...</p>
        ) : (
          <table className="styled-table">
            <thead>
              <tr>
                <th>Название типа компонента</th>
                <th>Статус подписки</th>
              </tr>
            </thead>
            <tbody>
              {componentTypes.length > 0 ? componentTypes.map(type => (
                <tr key={type.id}>
                  <td>{type.name}</td>
                  <td style={{ color: subscribedIds.has(type.id) ? 'green' : 'red', fontWeight: 'bold' }}>
                    {subscribedIds.has(type.id) ? 'Подписан' : 'Не подписан'}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="2">Типы компонентов не найдены.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default SubscriptionForm;