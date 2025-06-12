import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { addShipComponent, fetchComponentTypes } from '../services/api';

const AddComponent = () => {
  const { shipId } = useParams();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    component_type_id: '',
    serial_number: '',
    service_life_months: '12',
    last_inspection_date: new Date().toISOString().split('T')[0],
    status: 'Рабочий',
  });
  
  const [componentTypes, setComponentTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchComponentTypes()
      .then(data => {
        setComponentTypes(data.component_types || []);
      })
      .catch(err => {
        toast.error(err.message || 'Не удалось загрузить типы компонентов.');
        console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const validateForm = () => {
    const { name, component_type_id, serial_number, service_life_months, last_inspection_date } = formData;

    if (!name.trim()) {
      toast.error('Название компонента является обязательным полем.');
      return false;
    }
    if (name.length > 32) {
      toast.error('Название компонента не должно превышать 32 символа.');
      return false;
    }
    if (!component_type_id) {
        toast.error('Необходимо выбрать тип компонента.');
        return false;
    }
    if (serial_number && serial_number.length > 50) {
      toast.error('Серийный номер не должен превышать 50 символов.');
      return false;
    }
    const lifeMonths = parseInt(service_life_months, 10);
    if (isNaN(lifeMonths) || lifeMonths < 1 || lifeMonths > 600) {
      toast.error('Срок службы должен быть числом от 1 до 600 месяцев.');
      return false;
    }
    if (!last_inspection_date) {
      toast.error('Дата последней инспекции является обязательным полем.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
        return;
    }

    setIsSubmitting(true);
    const promise = addShipComponent(shipId, {
        ...formData,
        service_life_months: parseInt(formData.service_life_months, 10)
    });

    toast.promise(promise, {
        loading: 'Добавление компонента...',
        success: 'Компонент успешно добавлен!',
        error: (err) => err.message || 'Не удалось добавить компонент.',
    });

    try {
        await promise;
        setTimeout(() => navigate(`/ships/${shipId}/components`), 1500);
    } catch (err) {
        console.error(err);
    } finally {
        setIsSubmitting(false);
    }
  };
  
  const handleBack = () => navigate(`/ships/${shipId}/components`);

  const formDisabled = loading || isSubmitting;

  return (
    <div className="add-form">
      <div className="list-header">
        <h2>Добавление компонента</h2>
        <button onClick={handleBack} className="back-btn" disabled={formDisabled}>
          ← К списку компонентов
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="form-structure">
        <div className="form-group">
          <label htmlFor="name">Название компонента *</label>
          <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required maxLength="32" disabled={formDisabled} />
        </div>

        <div className="form-group">
          <label htmlFor="component_type_id">Тип компонента *</label>
          <select id="component_type_id" name="component_type_id" value={formData.component_type_id} onChange={handleChange} required disabled={formDisabled}>
            <option value="">{loading ? 'Загрузка...' : 'Выберите тип'}</option>
            {componentTypes.map(type => (
              <option key={type.id} value={type.id}>{type.name}</option>
            ))}
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="serial_number">Серийный номер</label>
          <input type="text" id="serial_number" name="serial_number" value={formData.serial_number} onChange={handleChange} maxLength="50" disabled={formDisabled} />
        </div>
        
        <div className="form-group">
          <label htmlFor="service_life_months">Срок службы (мес.) *</label>
          <input type="number" id="service_life_months" name="service_life_months" value={formData.service_life_months} onChange={handleChange} required min="1" max="600" disabled={formDisabled} />
        </div>

        <div className="form-group">
          <label htmlFor="last_inspection_date">Дата последней инспекции *</label>
          <input type="date" id="last_inspection_date" name="last_inspection_date" value={formData.last_inspection_date} onChange={handleChange} required disabled={formDisabled} />
        </div>

        <div className="form-group">
          <label htmlFor="status">Статус *</label>
          <select id="status" name="status" value={formData.status} onChange={handleChange} required disabled={formDisabled}>
            <option value="Рабочий">Рабочий</option>
            <option value="Требует проверки">Требует проверки</option>
            <option value="Неисправен">Неисправен</option>
          </select>
        </div>

        <button type="submit" className="submit-btn" disabled={formDisabled}>
          {isSubmitting ? 'Добавление...' : 'Добавить компонент'}
        </button>
      </form>
    </div>
  );
};

export default AddComponent;