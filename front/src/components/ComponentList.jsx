import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { confirmAlert } from 'react-confirm-alert';
import { fetchShipComponents, fetchShipDetails, fetchComponentTypes, deleteComponent } from '../services/api';
import Pagination from './Pagination';

const ComponentList = () => {
  const { shipId } = useParams();
  const navigate = useNavigate();
  const [components, setComponents] = useState([]);
  const [shipDetails, setShipDetails] = useState(null);
  const [componentTypes, setComponentTypes] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async (page) => {
    try {
      setLoading(true);
      const [compData, shipData, typesData] = await Promise.all([
        fetchShipComponents(shipId, page, 10),
        fetchShipDetails(shipId),
        fetchComponentTypes()
      ]);
      setComponents(compData.components || []);
      setCurrentPage(compData.current_page || 1);
      setTotalPages(compData.pages || 0);
      setShipDetails(shipData.ship || null);
      const typesMap = typesData.component_types.reduce((acc, type) => {
        acc[type.id] = type.name;
        return acc;
      }, {});
      setComponentTypes(typesMap);
    } catch (err) {
      if (err.status !== 401 && err.status !== 403) {
          toast.error(err.message || 'Не удалось загрузить данные о компонентах.');
      }
      console.error(err);
    } finally {
        setLoading(false);
    }
  }, [shipId]);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, loadData]);

  const handlePageChange = (page) => setCurrentPage(page);
  const handleViewDetails = (componentId) => navigate(`/components/${componentId}`);
  const handleBackToShips = () => navigate('/ships');
  const handleAddComponent = () => navigate(`/ships/${shipId}/add-component`);

  const handleDelete = (componentId, componentName) => {
    confirmAlert({
      title: 'Подтвердите удаление',
      message: `Вы уверены, что хотите удалить компонент "${componentName}"? \n\n Примечание: Удаление возможно только для компонентов статус которых "Списан".`,
      buttons: [
        {
          label: 'Да, удалить',
          className: 'delete-btn',
          onClick: async () => {
            const promise = deleteComponent(componentId);
            toast.promise(promise, {
              loading: `Удаление компонента "${componentName}"...`,
              success: `Компонент "${componentName}" успешно удален.`,
              error: (err) => err.message || 'Ошибка при удалении компонента.',
            });
            try {
              await promise;
              if (components.length === 1 && currentPage > 1) {
                setCurrentPage(currentPage - 1);
              } else {
                loadData(currentPage);
              }
            } catch (err) {
              console.error("Ошибка при удалении компонента:", err);
            }
          }
        },
        {
          label: 'Отмена',
          className: 'details-btn'
        }
      ]
    });
  };
  
  const TableLoader = () => (
    <tbody>
        <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>Загрузка компонентов...</td></tr>
    </tbody>
  );

  return (
    <div className="component-list">
      <div className="list-header">
        <h2>
          Компоненты судна: {shipDetails?.name || 'Загрузка...'}
          {shipDetails?.imo_number && ` (${shipDetails.imo_number})`}
        </h2>
        <div className="header-buttons">
          <button onClick={handleAddComponent} className="add-btn">
            Добавить компонент
          </button>
          <button onClick={handleBackToShips} className="back-btn">
            ← К списку судов
          </button>
        </div>
      </div>
      
      <table className="styled-table">
        <thead>
          <tr><th>Название</th><th>Тип</th><th>Статус</th><th>Действия</th></tr>
        </thead>
        {loading ? <TableLoader /> : (
          <tbody>
            {components.length > 0 ? components.map(comp => (
              <tr key={comp.id}>
                <td>{comp.name}</td>
                <td>{componentTypes[comp.component_type_id] || 'Неизвестный тип'}</td>
                <td>{comp.status}</td>
                <td>
                  <div className="action-buttons">
                    <button onClick={() => handleViewDetails(comp.id)} className="details-btn">Детали</button>
                    <button onClick={() => handleDelete(comp.id, comp.name)} className="delete-btn">Удалить</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '20px' }}>Компоненты не найдены. Вы можете добавить новый.</td></tr>
            )}
          </tbody>
        )}
      </table>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
};

export default ComponentList;