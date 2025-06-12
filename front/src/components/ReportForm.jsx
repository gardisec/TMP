import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import * as api from '../services/api';

const ReportForm = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const componentIdFromQuery = queryParams.get('componentId');
  const shipIdFromQuery = queryParams.get('shipId');

  const [ships, setShips] = useState([]);
  const [components, setComponents] = useState([]);
  const [shipImoInput, setShipImoInput] = useState('');
  const [selectedComponentId, setSelectedComponentId] = useState(componentIdFromQuery || '');
  const [selectedComponentDetails, setSelectedComponentDetails] = useState(null);
  
  const [loading, setLoading] = useState(true);
  
  const [formData, setFormData] = useState({
    update_name: '',
    new_status: 'Рабочий',
    notes: '',
    service_life_months: 12,
    update_service_life: false,
  });

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const shipsData = await api.fetchShips(1, 1000);
        setShips(shipsData?.ships || []);
        if (shipIdFromQuery) {
          const foundShip = shipsData.ships.find(s => String(s.id) === shipIdFromQuery);
          if (foundShip) {
            setShipImoInput(foundShip.imo_number || '');
          }
        }
      } catch (err) {
        toast.error(err.message || 'Ошибка загрузки начальных данных');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [shipIdFromQuery]);

  useEffect(() => {
    const fetchComponentsForShip = async () => {
        setComponents([]);
        setSelectedComponentId('');
        if (shipImoInput.trim()) {
            const ship = ships.find(s => s.imo_number === shipImoInput.trim());
            if (ship) {
                try {
                    const data = await api.fetchShipComponents(ship.id, 1, 1000);
                    setComponents(data?.components || []);
                    if (componentIdFromQuery && String(ship.id) === shipIdFromQuery) {
                       setSelectedComponentId(componentIdFromQuery);
                    }
                } catch (err) {
                    toast.error(err.message || 'Не удалось загрузить компоненты для судна');
                    console.error(err);
                }
            }
        }
    };
    fetchComponentsForShip();
  }, [shipImoInput, ships, componentIdFromQuery, shipIdFromQuery]);
  
  useEffect(() => {
    const fetchDetails = async () => {
        setSelectedComponentDetails(null);
        if (selectedComponentId) {
            try {
                const data = await api.fetchComponentDetails(selectedComponentId);
                setSelectedComponentDetails(data || null);
                setFormData(prev => ({
                    ...prev,
                    service_life_months: data?.service_life_months || 12,
                }));
            } catch(err) {
                toast.error(err.message || 'Не удалось загрузить детали компонента');
                console.error(err);
            }
        }
    };
    fetchDetails();
  }, [selectedComponentId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };
  
  const handleImoInputChange = (e) => setShipImoInput(e.target.value);
  const handleComponentChange = (e) => setSelectedComponentId(e.target.value);
  
  const validateForm = () => {
    if (!selectedComponentId) {
      toast.error('Пожалуйста, выберите компонент');
      return false;
    }
    if (!formData.update_name.trim()) {
        toast.error('Пожалуйста, укажите наименование работы.');
        return false;
    }
    if (formData.update_name.length > 32) {
        toast.error('Наименование работы не должно превышать 32 символа.');
        return false;
    }
    if (formData.notes && formData.notes.length > 1000) {
        toast.error('Поле "Примечания" слишком длинное.');
        return false;
    }
    if (formData.update_service_life) {
        const lifeMonths = parseInt(formData.service_life_months, 10);
        if (isNaN(lifeMonths) || lifeMonths < 1 || lifeMonths > 600) {
            toast.error('Новый срок службы должен быть числом от 1 до 600.');
            return false;
        }
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
        return;
    }

    const payload = {
      update_name: formData.update_name,
      new_status: formData.new_status,
      notes: formData.notes,
    };

    if (formData.update_service_life) {
      payload.service_life_months = parseInt(formData.service_life_months, 10);
    }
    
    const promise = api.updateComponentStatus(selectedComponentId, payload);

    toast.promise(promise, {
        loading: 'Отправка отчета...',
        success: 'Отчет успешно отправлен!',
        error: (err) => err.message || 'Ошибка отправки отчета.'
    });

    try {
        await promise;
        setTimeout(() => navigate(`/components/${selectedComponentId}`), 1500);
    } catch (err) {
        console.error(err);
    }
  };

  if (loading) return <div>Загрузка формы...</div>;

  return (
    <div className="add-form report-form">
      <div className="list-header">
        <h2>Обновление статуса компонента</h2>
      </div>
      
      <form onSubmit={handleSubmit} className="form-structure">
        <div className="form-group">
          <label>IMO-номер судна:</label>
          <input type="text" list="ships-imo" value={shipImoInput} onChange={handleImoInputChange} placeholder="Введите или выберите IMO" required />
          <datalist id="ships-imo">
            {ships.map(ship => <option key={ship.id} value={ship.imo_number}>{ship.name}</option>)}
          </datalist>
        </div>

        <div className="form-group">
          <label>Компонент:</label>
          <select value={selectedComponentId} onChange={handleComponentChange} required disabled={!components.length}>
            <option value="">{!components.length ? 'Нет компонентов для выбора' : 'Выберите компонент'}</option>
            {components.map(c => <option key={c.id} value={c.id}>{c.name} (Статус: {c.status})</option>)}
          </select>
        </div>

        {selectedComponentId && (
          <>
            <div className="form-group">
              <label>Наименование работы:</label>
              <input type="text" name="update_name" value={formData.update_name} onChange={handleChange} maxLength="32" required />
            </div>
            <div className="form-group">
              <label>Новый статус:</label><select name="new_status" value={formData.new_status} onChange={handleChange} required>
              <option value="Рабочий">Рабочий</option>
              <option value="Требует проверки">Требует проверки</option>
              <option value="Неисправен">Неисправен</option>
              <option value="В ремонте">В ремонте</option>
              <option value="Списан">Списан</option></select>
            </div>
            <div className="form-group">
              <label className="checkbox-label">
                <input type="checkbox" name="update_service_life" checked={formData.update_service_life} onChange={handleChange} />Обновить срок эксплуатации</label>
            </div>

            {formData.update_service_life && (
              <div className="form-group indented">
                <label>Новый срок эксплуатации (мес.):</label>
                <input type="number" name="service_life_months" min="1" max="600" value={formData.service_life_months} onChange={handleChange} required />
                {selectedComponentDetails && <p className="info-text">Текущий: {selectedComponentDetails.service_life_months} мес.</p>}
              </div>
            )}
            <div className="form-group"><label>Примечания:</label><textarea name="notes" value={formData.notes} onChange={handleChange} rows="3" /></div>
            <button type="submit" className="submit-btn">Отправить отчет</button>
          </>
        )}
      </form>
    </div>
  );
};

export default ReportForm;