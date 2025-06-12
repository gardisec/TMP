import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { addShip } from '../services/api';

const AddShip = () => {
  const [formData, setFormData] = useState({
    name: '',
    imo_number: '',
    type: '',
    owner_company: '',
  });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };
  
  const validateForm = () => {
    const { name, imo_number, type, owner_company } = formData;

    if (!name.trim()) {
      toast.error('Название судна является обязательным полем.');
      return false;
    }
    if (name.length > 32) {
      toast.error('Название судна не должно превышать 32 символа.');
      return false;
    }
    if (imo_number && imo_number.length > 50) {
      toast.error('IMO-номер не должен превышать 50 символов.');
      return false;
    }
    if (type && type.length > 32) {
      toast.error('Тип судна не должен превышать 32 символа.');
      return false;
    }
    if (owner_company && owner_company.length > 32) {
      toast.error('Компания-владелец не должна превышать 32 символа.');
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
    const promise = addShip(formData);

    toast.promise(promise, {
        loading: 'Добавление судна...',
        success: 'Судно успешно добавлено!',
        error: (err) => err.message || 'Не удалось добавить судно.',
    });

    try {
        await promise;
        setTimeout(() => navigate('/ships'), 1500);
    } catch (err) {
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="add-form">
      <div className="list-header">
        <h2>Добавление нового судна</h2>
        <button onClick={() => navigate('/ships')} className="back-btn" disabled={loading}>
          ← К списку судов
        </button>
      </div>
      
      <form onSubmit={handleSubmit} className="form-structure">
        <div className="form-group">
          <label htmlFor="name">Название судна *</label>
          <input type="text" id="name" name="name" value={formData.name} onChange={handleChange} required maxLength="32" disabled={loading} />
        </div>
        <div className="form-group">
          <label htmlFor="imo_number">IMO-номер</label>
          <input type="text" id="imo_number" name="imo_number" value={formData.imo_number} onChange={handleChange} maxLength="50" disabled={loading} />
        </div>
        <div className="form-group">
          <label htmlFor="type">Тип судна</label>
          <input type="text" id="type" name="type" value={formData.type} onChange={handleChange} maxLength="32" disabled={loading} />
        </div>
        <div className="form-group">
          <label htmlFor="owner_company">Компания-владелец</label>
          <input type="text" id="owner_company" name="owner_company" value={formData.owner_company} onChange={handleChange} maxLength="32" disabled={loading} />
        </div>
        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? 'Добавление...' : 'Добавить судно'}
        </button>
      </form>
    </div>
  );
};

export default AddShip;