CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(32) NOT NULL
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    telegram_id BIGINT,
    role_id INTEGER NOT NULL REFERENCES roles(id)
);

CREATE TABLE ships (
    id SERIAL PRIMARY KEY,
    name VARCHAR(32) NOT NULL,
    imo_number VARCHAR(50) UNIQUE,
    type VARCHAR(32),
    owner_company VARCHAR(32)
);

CREATE TABLE component_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(32) NOT NULL UNIQUE
);

CREATE TABLE components (
    id SERIAL PRIMARY KEY,
    name VARCHAR(32) NOT NULL,
    ship_id INTEGER NOT NULL REFERENCES ships(id) ON DELETE CASCADE,
    component_type_id INTEGER NOT NULL REFERENCES component_types(id),
    serial_number VARCHAR(50),
    service_life_months INTEGER NOT NULL,
    last_inspection_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL
);

CREATE TABLE component_updates (
    id SERIAL PRIMARY KEY,
    component_id INTEGER NOT NULL REFERENCES components(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    update_name VARCHAR(32) NOT NULL,
    update_date DATE NOT NULL,
    new_status VARCHAR(32) NOT NULL,
    notes TEXT
);

CREATE TABLE component_audit (
    id SERIAL PRIMARY KEY,
    component_id INTEGER NOT NULL,
    operation_type VARCHAR(10) NOT NULL,
    old_name VARCHAR(32),
    new_name VARCHAR(32),
    old_status VARCHAR(32),
    new_status VARCHAR(32),
    old_last_inspection_date DATE,
    new_last_inspection_date DATE,
    user_id INTEGER REFERENCES users(id),
    change_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE component_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    component_type_id INTEGER NOT NULL REFERENCES component_types(id) ON DELETE CASCADE,
    UNIQUE (user_id, component_type_id)
);

-- Триггеры
CREATE OR REPLACE FUNCTION public.check_component_status_update_permissions()
RETURNS trigger
LANGUAGE 'plpgsql'
COST 100
VOLATILE NOT LEAKPROOF
AS $BODY$
DECLARE
    user_role_name VARCHAR(32);
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = NEW.user_id) THEN
        RAISE EXCEPTION 'Пользователь с id % не существует', NEW.user_id;
    END IF;

    SELECT r.name INTO user_role_name
    FROM users u
    JOIN roles r ON u.role_id = r.id
    WHERE u.id = NEW.user_id;

    IF NEW.new_status IS DISTINCT FROM (
        SELECT status FROM components WHERE id = NEW.component_id
    ) THEN
        IF user_role_name NOT IN ('Специалист', 'Администратор') THEN
            RAISE EXCEPTION 'Только Специалист или Администратор могут изменять статус компонента';
        END IF;
    END IF;

    RETURN NEW;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.log_component_changes()
RETURNS trigger
LANGUAGE 'plpgsql'
COST 100
VOLATILE NOT LEAKPROOF
AS $BODY$
DECLARE
    current_user_id INTEGER;
BEGIN
    SELECT id INTO current_user_id FROM users WHERE username = current_user;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO component_audit (component_id, operation_type, new_name, new_status,
                                    new_last_inspection_date, user_id)
        VALUES (NEW.id, 'INSERT', NEW.name, NEW.status, NEW.last_inspection_date, current_user_id);
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.name <> NEW.name OR OLD.status <> NEW.status OR OLD.last_inspection_date <>
           NEW.last_inspection_date THEN
            INSERT INTO component_audit (component_id, operation_type, old_name, new_name, old_status,
                                        new_status, old_last_inspection_date, new_last_inspection_date, user_id)
            VALUES (NEW.id, 'UPDATE', OLD.name, NEW.name, OLD.status, NEW.status,
                    OLD.last_inspection_date, NEW.last_inspection_date, current_user_id);
        END IF;
    END IF;

    RETURN NEW;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.prevent_component_deletion()
RETURNS trigger
LANGUAGE 'plpgsql'
COST 100
VOLATILE NOT LEAKPROOF
AS $BODY$
BEGIN
    IF OLD.status NOT IN ('Списан') THEN
        RAISE EXCEPTION 'Нельзя удалить компонент со статусом %,
        только компоненты со статусом "Списан" могут быть удалены', OLD.status;
    END IF;
    RETURN OLD;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.update_last_inspection_date()
RETURNS trigger
LANGUAGE 'plpgsql'
COST 100
VOLATILE NOT LEAKPROOF
AS $BODY$
BEGIN
    IF NEW.status <> OLD.status THEN
        NEW.last_inspection_date = CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.validate_component_status()
RETURNS trigger
LANGUAGE 'plpgsql'
COST 100
VOLATILE NOT LEAKPROOF
AS $BODY$
BEGIN
    IF NEW.status NOT IN ('Рабочий', 'Требует проверки', 'Неисправен', 'В ремонте', 'Списан') THEN
        RAISE EXCEPTION 'Некорректный статус компонента. Допустимые значения: "Рабочий",
        "Требует проверки", "Неисправен", "В ремонте", "Списан"';
    END IF;
    RETURN NEW;
END;
$BODY$;

CREATE TRIGGER component_insert_audit
AFTER INSERT ON components
FOR EACH ROW
EXECUTE FUNCTION log_component_changes();

CREATE TRIGGER component_update_audit
AFTER UPDATE ON components
FOR EACH ROW
EXECUTE FUNCTION log_component_changes();

CREATE TRIGGER check_component_status
BEFORE INSERT OR UPDATE ON components
FOR EACH ROW
EXECUTE FUNCTION validate_component_status();

CREATE TRIGGER block_component_deletion
BEFORE DELETE ON components
FOR EACH ROW
EXECUTE FUNCTION prevent_component_deletion();

CREATE TRIGGER auto_update_inspection_date
BEFORE UPDATE ON components
FOR EACH ROW
EXECUTE FUNCTION update_last_inspection_date();

CREATE TRIGGER tr_component_status_update_permissions
BEFORE INSERT OR UPDATE ON component_updates
FOR EACH ROW
EXECUTE FUNCTION check_component_status_update_permissions();

-- Функции
CREATE OR REPLACE FUNCTION public.count_component_updates(
    start_date date,
    end_date date)
RETURNS integer
LANGUAGE 'plpgsql'
COST 100
VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE
    updates_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO updates_count
    FROM component_updates
    WHERE update_date BETWEEN start_date AND end_date;
    RETURN updates_count;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.get_avg_repair_time(
    user_id_param integer)
RETURNS interval
LANGUAGE 'plpgsql'
COST 100
VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE
    avg_time INTERVAL;
BEGIN
    SELECT AVG(update_date - c.last_inspection_date)
    INTO avg_time
    FROM component_updates cu
    JOIN components c ON cu.component_id = c.id
    WHERE cu.user_id = user_id_param
    AND cu.update_name IN ('Ремонт', 'Аварийный ремонт', 'Замена');
    RETURN avg_time;
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.is_valid_component_status(
    component_id_param integer)
RETURNS boolean
LANGUAGE 'plpgsql'
COST 100
VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE
    current_status VARCHAR(32);
    valid_statuses TEXT[] := ARRAY['Рабочий', 'Требует проверки', 'Неисправен', 'На обслуживании'];
BEGIN
    SELECT status INTO current_status
    FROM components
    WHERE id = component_id_param;
    IF current_status IS NULL THEN
        RETURN FALSE;
    END IF;
    RETURN current_status = ANY(valid_statuses);
END;
$BODY$;

CREATE OR REPLACE FUNCTION public.top_component_issues_by_quarter(
    input_quarter integer,
    input_year integer,
    input_limit integer DEFAULT 5)
RETURNS TABLE(component_type character varying, issue_count integer, most_common_issue character varying)
LANGUAGE 'sql'
COST 100
VOLATILE PARALLEL UNSAFE
ROWS 1000
AS $BODY$
SELECT
    ct.name::VARCHAR(32) AS component_type,
    COUNT(*)::INT AS issue_count,
    cu.update_name::VARCHAR(32) AS most_common_issue
FROM component_updates cu
JOIN components c ON cu.component_id = c.id
JOIN component_types ct ON c.component_type_id = ct.id
WHERE EXTRACT(QUARTER FROM cu.update_date) = input_quarter
AND EXTRACT(YEAR FROM cu.update_date) = input_year
AND cu.new_status = 'Неисправен'
GROUP BY ct.name, cu.update_name
ORDER BY issue_count DESC
LIMIT input_limit;
$BODY$;

-- Заполнение данными
INSERT INTO roles (name) VALUES
('Администратор'),
('Специалист'),
('Матрос');

INSERT INTO users (username, password_hash, telegram_id, role_id) VALUES
('admin', 'scrypt:32768:8:1$3WrCSs26chgGGGbB$10541fcda0275fd6c9d1cd191f64d6ca6d9c8ce604401334aab7ed6cd695a34d91b67d18d21e5d50cf243c5bede686812c360d603c7a5cc695f94b031e067d74', 5373815032, 1),
('engineer_ivanov', 'scrypt:32768:8:1$3WrCSs26chgGGGbB$10541fcda0275fd6c9d1cd191f64d6ca6d9c8ce604401334aab7ed6cd695a34d91b67d18d21e5d50cf243c5bede686812c360d603c7a5cc695f94b031e067d74', 987654321, 2),
('sailor_petrov', 'scrypt:32768:8:1$3WrCSs26chgGGGbB$10541fcda0275fd6c9d1cd191f64d6ca6d9c8ce604401334aab7ed6cd695a34d91b67d18d21e5d50cf243c5bede686812c360d603c7a5cc695f94b031e067d74', 555666777, 3);

INSERT INTO ships (name, imo_number, type, owner_company) VALUES
('Морской волк', 'IMO1234567', 'Танкер', 'Северный флот'),
('Быстрый', 'IMO7654321', 'Эсминец', 'Тихоокеанский флот'),
('Восток', 'IMO9876543', 'Грузовое', 'Дальневосточное пароходство');


INSERT INTO component_types (name) VALUES
('Двигатель'),
('Навигация'),
('Радиосвязь');

INSERT INTO components (name, ship_id, component_type_id, serial_number, service_life_months, last_inspection_date, status) VALUES
('Главный двигатель', 1, 1, 'ENG-001-2020', 36, '2023-01-15', 'Рабочий'),
('Вспомогательный двигатель', 1, 1, 'ENG-002-2020', 36, '2023-01-15', 'Рабочий'),
('Радар', 1, 2, 'NAV-002-2021', 24, '2023-03-20', 'Требует проверки'),
('GPS система', 1, 2, 'NAV-003-2021', 24, '2023-03-20', 'Рабочий');

INSERT INTO component_updates (component_id, user_id, update_name, update_date, new_status, notes) VALUES
(1, 2, 'Плановая проверка', '2023-01-15', 'Рабочий', 'Проверка давления масла в норме'),
(2, 2, 'Диагностика', '2023-03-20', 'Требует проверки', 'Обнаружены помехи в работе'),
(3, 2, 'Замена антенны', '2023-02-10', 'Рабочий', 'Установлена новая антенна');
