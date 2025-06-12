import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { fetchExpiringComponents, fetchShips, fetchComponentTypes } from '../services/api';
import Pagination from './Pagination';

const ExpiringComponents = () => {
  const [components, setComponents] = useState([]);
  const [ships, setShips] = useState({});
  const [componentTypes, setComponentTypes] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const loadData = useCallback(async (page) => {
    try {
      setLoading(true);
      const [expiringData, shipsData, typesData] = await Promise.all([
        fetchExpiringComponents(page, 10),
        fetchShips(1, 1000),
        fetchComponentTypes(),
      ]);

      setComponents(expiringData.expiring_components || []);
      setCurrentPage(expiringData.current_page || 1);
      setTotalPages(expiringData.pages || 0);

      const shipsMap = shipsData.ships.reduce((acc, ship) => {
        acc[ship.id] = { name: ship.name, imo: ship.imo_number };
        return acc;
      }, {});
      setShips(shipsMap);

      const typesMap = typesData.component_types.reduce((acc, type) => {
        acc[type.id] = type.name;
        return acc;
      }, {});
      setComponentTypes(typesMap);

    } catch (error) {
      if (error.status !== 401 && error.status !== 403) {
          toast.error(error.message || "Не удалось загрузить данные.");
      }
      console.error("Failed to load expiring components", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage, loadData]);

  const handlePageChange = (page) => setCurrentPage(page);
  const handleViewDetails = (id) => navigate(`/components/${id}`);
  const handleCreateReport = (comp) => navigate(`/report?componentId=${comp.id}&shipId=${comp.ship_id}`);
  
  const TableLoader = () => (
    <tbody>
        <tr>
            <td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>
                Загрузка данных...
            </td>
        </tr>
    </tbody>
  );

  return (
    <div className="expiring-components">
      <h2>Компоненты с истекающим сроком (ближайшие 90 дней)</h2>
      <table className="styled-table">
        <thead>
          <tr>
            <th>Компонент</th>
            <th>Судно (IMO)</th>
            <th>Тип</th>
            <th>Окончание срока</th>
            <th>Статус</th>
            <th>Действия</th>
          </tr>
        </thead>
        {loading ? <TableLoader /> : (
          <tbody>
            {components.length > 0 ? components.map(comp => (
              <tr key={comp.id}>
                <td>{comp.name}</td>
                <td>{ships[comp.ship_id]?.name || 'N/A'} ({ships[comp.ship_id]?.imo || 'N/A'})</td>
                <td>{componentTypes[comp.component_type_id] || 'N/A'}</td>
                <td>{new Date(comp.expiration_date).toLocaleDateString()}</td>
                <td>{comp.status}</td>
                <td>
                  <div className="action-buttons">
                    <button onClick={() => handleViewDetails(comp.id)} className="details-btn">Детали</button>
                    <button onClick={() => handleCreateReport(comp)} className="report-btn">Обновить</button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr><td colSpan="7" style={{ textAlign: 'center', padding: '20px' }}>Компоненты с истекающим сроком не найдены.</td></tr>
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

export default ExpiringComponents;