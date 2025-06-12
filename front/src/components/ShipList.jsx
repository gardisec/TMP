import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { confirmAlert } from 'react-confirm-alert'; 
import { fetchShips, deleteShip } from '../services/api';


const ShipList = () => {
  const [allShips, setAllShips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const navigate = useNavigate();

  const loadAllShips = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchShips(1, 1000);
      setAllShips(data.ships || []);
    } catch (err) {
      if (err.status !== 401 && err.status !== 403) {
          toast.error(err.message || 'Не удалось загрузить список судов.');
      }
      console.error(err);
    } finally {
        setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllShips();
  }, [loadAllShips]);
  
  const filteredShips = useMemo(() => {
    if (!searchTerm) {
      return allShips;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return allShips.filter(ship =>
      ship.name.toLowerCase().includes(lowercasedFilter) ||
      (ship.imo_number && ship.imo_number.toLowerCase().includes(lowercasedFilter))
    );
  }, [searchTerm, allShips]);


  const handleViewComponents = (shipId) => {
    navigate(`/ships/${shipId}/components`);
  };

  const handleDelete = (shipId, shipName) => {
    confirmAlert({
      title: 'Подтвердите удаление',
      message: `Вы уверены, что хотите удалить судно "${shipName}" и все его компоненты? Это действие необратимо.`,
      buttons: [
        {
          label: 'Да, удалить',
          className: 'delete-btn',
          onClick: async () => {
            const promise = deleteShip(shipId);
            toast.promise(promise, {
              loading: `Удаление судна "${shipName}"...`,
              success: `Судно "${shipName}" успешно удалено.`,
              error: (err) => err.message || 'Ошибка при удалении судна.',
            });
            try {
              await promise;
              loadAllShips();
            } catch (err) {
              console.error("Ошибка при удалении судна:", err);
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

  const handleAddShip = () => {
    navigate('/add-ship');
  };

  return (
    <div className="ship-list">
      <div className="list-header">
        <h2>Список судов</h2>
        <button onClick={handleAddShip} className="add-btn">
          Добавить судно
        </button>
      </div>

      <div className="filter-container">
        <input
            type="text"
            placeholder="Поиск по названию или IMO..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="filter-input"
        />
      </div>
      
      <table className="styled-table">
        <thead>
          <tr>
            <th>Название</th>
            <th>IMO-номер</th>
            <th>Тип судна</th>
            <th>Владелец</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan="5">Загрузка судов...</td></tr>
          ) : filteredShips.length > 0 ? filteredShips.map(ship => (
            <tr key={ship.id}>
              <td>{ship.name}</td>
              <td>{ship.imo_number || 'N/A'}</td>
              <td>{ship.type || 'N/A'}</td>
              <td>{ship.owner_company || 'N/A'}</td>
              <td>
                <div className="action-buttons">
                  <button onClick={() => handleViewComponents(ship.id)} className="details-btn">
                    Компоненты
                  </button>
                  <button onClick={() => handleDelete(ship.id, ship.name)} className="delete-btn">
                    Удалить
                  </button>
                </div>
              </td>
            </tr>
          )) : (
            <tr><td colSpan="5">{searchTerm ? "Суда не найдены по вашему запросу." : "Суда не найдены. Вы можете добавить новое."}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ShipList;