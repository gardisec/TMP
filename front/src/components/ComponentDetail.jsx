import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { fetchComponentDetails, fetchComponentUpdates } from '../services/api';
import Pagination from './Pagination';

const ComponentDetail = () => {
  const { componentId } = useParams();
  const navigate = useNavigate();
  
  const [component, setComponent] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const loadUpdates = useCallback(async (page) => {
      try {
          const updatesData = await fetchComponentUpdates(componentId, page);
          setUpdates(updatesData.updates || []);
          setCurrentPage(updatesData.current_page || 1);
          setTotalPages(updatesData.pages || 0);
      } catch (err) {
          toast.error(err.message || 'Не удалось загрузить историю обновлений.');
          console.error(err);
      }
  }, [componentId]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const [compData, updatesData] = await Promise.all([
          fetchComponentDetails(componentId),
          fetchComponentUpdates(componentId, 1)
        ]);
        
        setComponent(compData);
        setUpdates(updatesData.updates || []);
        setCurrentPage(updatesData.current_page || 1);
        setTotalPages(updatesData.pages || 0);

      } catch (err) {
        if (err.status !== 401 && err.status !== 403) {
            toast.error(err.message || 'Не удалось загрузить детали компонента.');
        }
        if (err.status === 404) {
            navigate('/ships');
        }
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [componentId, navigate]);

  const handlePageChange = (page) => {
    loadUpdates(page);
  };
  
  const handleBackToComponents = () => {
      if (component?.ship?.id) {
          navigate(`/ships/${component.ship.id}/components`);
      } else {
          navigate('/ships');
      }
  };
  const handleCreateReport = () => navigate(`/report?componentId=${componentId}&shipId=${component?.ship?.id}`);

  if (loading) return <div>Загрузка деталей компонента...</div>;
  
  if (!component) {
      return (
          <div className="error-message" style={{textAlign: 'center', padding: '20px'}}>
              Не удалось загрузить данные. Возможно, компонент был удален.
              <br/><br/>
              <button onClick={() => navigate('/ships')} className="back-btn">Вернуться к списку судов</button>
          </div>
      );
  }

  return (
    <div className="component-detail">
      <div className="list-header">
        <h2>Компонент: {component.name}</h2>
        <button onClick={handleBackToComponents} className="back-btn">
          ← К списку компонентов
        </button>
      </div>

      <div className="component-info-grid">
        <div><strong>Судно:</strong> {component.ship?.name || 'N/A'}</div>
        <div><strong>Тип:</strong> {component.component_type?.name || 'N/A'}</div>
        <div><strong>Серийный номер:</strong> {component.serial_number || 'N/A'}</div>
        <div><strong>Срок службы:</strong> {component.service_life_months} мес.</div>
        <div><strong>Последняя проверка:</strong> {new Date(component.last_inspection_date).toLocaleDateString()}</div>
        <div><strong>Статус:</strong> <span className={`status-${component.status?.toLowerCase().replace(/ /g, '-')}`}>{component.status}</span></div>
      </div>

      <h3>История обновлений</h3>
      <table className="styled-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Наименование работы</th>
            <th>Новый статус</th>
            <th>Примечания</th>
            <th>Пользователь</th>
          </tr>
        </thead>
        <tbody>
          {updates.length > 0 ? updates.map((update) => (
            <tr key={update.id}>
              <td>{new Date(update.update_date).toLocaleDateString()}</td>
              <td>{update.update_name}</td>
              <td>{update.new_status}</td>
              <td style={{whiteSpace: 'pre-wrap'}}>{update.notes || 'N/A'}</td>
              <td>{update.user?.username || 'N/A'}</td>
            </tr>
          )) : (
            <tr><td colSpan="5" style={{textAlign: 'center'}}>История обновлений пуста.</td></tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      <div className="actions">
        <button onClick={handleCreateReport} className="report-btn">Обновить статус</button>
      </div>
    </div>
  );
};

export default ComponentDetail;