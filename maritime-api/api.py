import logging
from logging.handlers import RotatingFileHandler
from flask import Flask, request, jsonify, has_request_context
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timedelta
from sqlalchemy import func, text
from flask_cors import CORS
from sqlalchemy import Integer
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.exceptions import HTTPException
from flask_jwt_extended import (
    JWTManager, create_access_token, create_refresh_token, set_access_cookies,
    set_refresh_cookies, jwt_required, unset_jwt_cookies, get_jwt_identity, get_jwt
)
import os
from functools import wraps
from sqlalchemy.orm import joinedload

def get_request_ip():
    if has_request_context():
        if request.headers.getlist("X-Forwarded-For"):
            return request.headers.getlist("X-Forwarded-For")[0]
        if request.headers.get("X-Real-IP"):
            return request.headers.get("X-Real-IP")
        return request.remote_addr
    return "N/A"

class RequestIPFilter(logging.Filter):
    def filter(self, record):
        record.ip = get_request_ip()
        return True

app = Flask(__name__)

app.logger.setLevel(logging.INFO)
log_formatter = logging.Formatter(
    '%(asctime)s - %(levelname)s - [%(ip)s] - %(message)s'
)
file_handler = RotatingFileHandler('app.log', maxBytes=5*1024*1024, backupCount=2, encoding='utf-8')
file_handler.setFormatter(log_formatter)
file_handler.addFilter(RequestIPFilter())
stream_handler = logging.StreamHandler()
stream_handler.setFormatter(log_formatter)
stream_handler.addFilter(RequestIPFilter())
app.logger.addHandler(file_handler)
app.logger.addHandler(stream_handler)


CORS(app, resources={
    r"/api/*": {
        "origins": ["https://77.239.102.184"],
        "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "X-CSRF-TOKEN", "Authorization"],
        "supports_credentials": True,
    }
})

app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'postgresql://admin:123@postgres:5432/maritime_db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config["JWT_SECRET_KEY"] = os.environ.get("JWT_SECRET_KEY", "your-default-super-secret-key")

app.config["JWT_TOKEN_LOCATION"] = ["cookies"]
app.config["JWT_COOKIE_SECURE"] = True
app.config["JWT_COOKIE_HTTPONLY"] = True
app.config["JWT_COOKIE_SAMESITE"] = "Lax"
app.config["JWT_ACCESS_CSRF_HEADER_NAME"] = "X-CSRF-TOKEN"
app.config["JWT_COOKIE_CSRF_PROTECT"] = True
app.config["JWT_CSRF_IN_COOKIES"] = True
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=15)
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)
app.config["JWT_ACCESS_COOKIE_PATH"] = "/api/"
app.config["JWT_REFRESH_COOKIE_PATH"] = "/api/refresh"

db = SQLAlchemy(app)
jwt = JWTManager(app)

class Role(db.Model):
    __tablename__ = 'roles'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(32), nullable=False)

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.Text, nullable=False)
    telegram_id = db.Column(db.BigInteger)
    role_id = db.Column(db.Integer, db.ForeignKey('roles.id'), nullable=False)
    subscriptions = db.relationship('ComponentSubscription', backref='user', lazy=True, cascade="all, delete-orphan")

class Ship(db.Model):
    __tablename__ = 'ships'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(32), nullable=False)
    imo_number = db.Column(db.String(50), unique=True)
    type = db.Column(db.String(32))
    owner_company = db.Column(db.String(32))
    components = db.relationship('Component', backref='ship', lazy=True, cascade="all, delete-orphan")

class ComponentType(db.Model):
    __tablename__ = 'component_types'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(32), unique=True, nullable=False)
    subscriptions = db.relationship('ComponentSubscription', backref='component_type', lazy=True, cascade="all, delete-orphan")

class Component(db.Model):
    __tablename__ = 'components'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(32), nullable=False)
    ship_id = db.Column(db.Integer, db.ForeignKey('ships.id'), nullable=False)
    component_type_id = db.Column(db.Integer, db.ForeignKey('component_types.id'), nullable=False)
    serial_number = db.Column(db.String(50))
    service_life_months = db.Column(db.Integer, nullable=False)
    last_inspection_date = db.Column(db.Date, nullable=False)
    status = db.Column(db.String(32), nullable=False)
    updates = db.relationship('ComponentUpdate', backref='component', lazy=True, cascade="all, delete-orphan")

class ComponentUpdate(db.Model):
    __tablename__ = 'component_updates'
    id = db.Column(db.Integer, primary_key=True)
    component_id = db.Column(db.Integer, db.ForeignKey('components.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    update_name = db.Column(db.String(32), nullable=False)
    update_date = db.Column(db.Date, nullable=False)
    new_status = db.Column(db.String(32), nullable=False)
    notes = db.Column(db.Text)
    user = db.relationship('User', backref='component_updates')

class ComponentSubscription(db.Model):
    __tablename__ = 'component_subscriptions'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    component_type_id = db.Column(db.Integer, db.ForeignKey('component_types.id'), nullable=False)
    __table_args__ = (db.UniqueConstraint('user_id', 'component_type_id', name='_user_component_type_uc'),)

ERROR_MESSAGES = {
    "MISSING_FIELDS": "Отсутствуют обязательные поля.",
    "INVALID_DATA": "Предоставлены неверные данные.",
    "INVALID_LENGTH": "Недопустимая длина поля.",
    "NOT_FOUND": "Запрошенный ресурс не найден.",
    "ALREADY_EXISTS": "Такая запись уже существует.",
    "FORBIDDEN": "Доступ запрещен.",
    "INTERNAL_ERROR": "Внутренняя ошибка сервера.",
    "CANNOT_DELETE_ACTIVE": "Удаление невозможно. Статус компонента должен быть 'Списан'.",
    "JWT_UNAUTHORIZED": "Токен доступа отсутствует или недействителен.",
    "JWT_INVALID_TOKEN": "Некорректный токен.",
    "JWT_TOKEN_EXPIRED": "Срок действия токена истек."
}

@app.errorhandler(Exception)
def handle_exception(e):
    if isinstance(e, HTTPException):
        response = e.get_response()
        response.data = jsonify({ "success": False, "error": e.description }).data
        response.content_type = "application/json"
        return response
    app.logger.error(f"Unhandled Exception on path {request.path}: {e}", exc_info=True)
    return jsonify({"success": False, "error": ERROR_MESSAGES["INTERNAL_ERROR"]}), 500

@jwt.unauthorized_loader
def unauthorized_response(callback_reason):
    return jsonify(success=False, error=ERROR_MESSAGES["JWT_UNAUTHORIZED"]), 401

@jwt.invalid_token_loader
def invalid_token_response(callback_error):
    return jsonify(success=False, error=ERROR_MESSAGES["JWT_INVALID_TOKEN"]), 422

@jwt.expired_token_loader
def expired_token_response(jwt_header, jwt_payload):
    return jsonify(success=False, error=ERROR_MESSAGES["JWT_TOKEN_EXPIRED"]), 401

# auth endpoints
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "Отсутствует тело запроса."}), 400
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"success": False, "error": ERROR_MESSAGES["MISSING_FIELDS"]}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"success": False, "error": ERROR_MESSAGES["ALREADY_EXISTS"]}), 409
    try:
        new_user = User(username=username, password_hash=generate_password_hash(password), role_id=2)
        db.session.add(new_user)
        db.session.commit()
        app.logger.info(f"New user registered: '{username}' (ID: {new_user.id})")
        access_token = create_access_token(identity=str(new_user.id), additional_claims={"role_id": 2})
        refresh_token = create_refresh_token(identity=str(new_user.id))
        response = jsonify({"success": True, "message": "Регистрация прошла успешно", "user_id": str(new_user.id), "role_id": 2})
        set_access_cookies(response, access_token)
        set_refresh_cookies(response, refresh_token)
        return response, 201
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"Database error during registration: {e}", exc_info=True)
        return jsonify({"success": False, "error": ERROR_MESSAGES["INTERNAL_ERROR"]}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "Отсутствует тело запроса."}), 400
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"success": False, "error": ERROR_MESSAGES["MISSING_FIELDS"]}), 400
    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"success": False, "error": "Неверный логин или пароль"}), 401
    app.logger.info(f"User '{username}' (ID: {user.id}) logged in successfully.")
    access_token = create_access_token(identity=str(user.id), additional_claims={"role_id": user.role_id})
    refresh_token = create_refresh_token(identity=str(user.id))
    response = jsonify({"success": True, "message": "Вход выполнен успешно", "user_id": str(user.id), "role_id": user.role_id})
    set_access_cookies(response, access_token)
    set_refresh_cookies(response, refresh_token)
    return response, 200

@app.route('/api/logout', methods=['POST'])
@jwt_required()
def logout():
    current_user_id = get_jwt_identity()
    app.logger.info(f"User with ID {current_user_id} logged out.")
    response = jsonify({"success": True, "message": "Выход выполнен успешно"})
    unset_jwt_cookies(response)
    return response, 200

@app.route('/api/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    current_user_id = get_jwt_identity()
    user = db.session.get(User, current_user_id)
    if not user:
         app.logger.error(f"Refresh attempt for non-existent user ID: {current_user_id}")
         return jsonify({"success": False, "error": "User not found"}), 404
         
    role_id = user.role_id 
    
    app.logger.info(f"Token refresh successful for user ID: {current_user_id}")
    new_access_token = create_access_token(identity=current_user_id, additional_claims={"role_id": role_id})
    
    response = jsonify({"success": True, "message": "Access token has been refreshed."})
    set_access_cookies(response, new_access_token)
    return response, 200

@app.route('/api/me', methods=['GET'])
@jwt_required()
def get_me_route():
    current_user_id = get_jwt_identity()
    user = db.session.get(User, current_user_id)
    if not user:
        return jsonify({"success": False, "error": ERROR_MESSAGES["NOT_FOUND"]}), 404
    
    claims = get_jwt()
    return jsonify({
        "success": True, "user_id": current_user_id, "username": user.username,
        "role_id": claims.get("role_id"), "telegram_id": user.telegram_id
    }), 200

# CRUD
@app.route('/api/users/<int:user_id>', methods=['PATCH'])
@jwt_required()
def update_user(user_id): 
    current_user_id = get_jwt_identity()
    if int(current_user_id) != user_id:
        return jsonify({"success": False, "error": ERROR_MESSAGES["FORBIDDEN"]}), 403
    
    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": "Необходимо передать данные"}), 400
    
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"success": False, "error": ERROR_MESSAGES["NOT_FOUND"]}), 404
    
    if 'telegram_id' in data:
        telegram_id_value = data.get('telegram_id')
        
        if telegram_id_value is None or telegram_id_value == '':
            user.telegram_id = None
        else:
            try:
                telegram_id_int = int(telegram_id_value)
                
                if not (0 < telegram_id_int < 9000000000000000000):
                    return jsonify({
                        "success": False, 
                        "error": "Некорректное значение Telegram ID. ID должен быть положительным числом."
                    }), 400
                    
                user.telegram_id = telegram_id_int

            except (ValueError, TypeError):
                return jsonify({
                    "success": False, 
                    "error": "Некорректный формат Telegram ID. Ожидается числовое значение."
                }), 400
    try:
        db.session.commit()
        return jsonify({
            "success": True, 
            "message": "Данные пользователя обновлены",
            "user": {
                "id": user.id, 
                "username": user.username, 
                "telegram_id": user.telegram_id
            }
        })
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"DB error updating user {user_id}: {e}", exc_info=True)
        return jsonify({"success": False, "error": ERROR_MESSAGES["INTERNAL_ERROR"]}), 500
    

@app.route('/api/ships', methods=['POST'])
@jwt_required()
def add_ship():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    if not data or not data.get('name'):
        return jsonify({'success': False, 'error': ERROR_MESSAGES['MISSING_FIELDS'] + " (name)"}), 400

    if len(data['name']) > 32:
        return jsonify({'success': False, 'error': ERROR_MESSAGES['INVALID_LENGTH'] + " (name: max 32)"}), 400
    if 'imo_number' in data and data.get('imo_number') and len(data['imo_number']) > 50:
        return jsonify({'success': False, 'error': ERROR_MESSAGES['INVALID_LENGTH'] + " (imo_number: max 50)"}), 400
    if 'imo_number' in data and data.get('imo_number') and Ship.query.filter_by(imo_number=data['imo_number']).first():
        return jsonify({'success': False, 'error': ERROR_MESSAGES['ALREADY_EXISTS'] + " (imo_number)"}), 409
    
    try:
        new_ship = Ship(
            name=data['name'],
            imo_number=data.get('imo_number'),
            type=data.get('type'),
            owner_company=data.get('owner_company')
        )
        db.session.add(new_ship)
        db.session.commit()
        app.logger.info(f"User {current_user_id} created new ship '{new_ship.name}' (ID: {new_ship.id})")
        return jsonify({'success': True, 'ship': {'id': new_ship.id, 'name': new_ship.name, 'imo_number': new_ship.imo_number}}), 201
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"DB error creating ship by user {current_user_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': ERROR_MESSAGES['INTERNAL_ERROR']}), 500

@app.route('/api/ships', methods=['GET'])
@jwt_required()
def handle_ships():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    paginated_ships = Ship.query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'success': True,
        'ships': [{'id': s.id, 'name': s.name, 'imo_number': s.imo_number, 'type': s.type, 'owner_company': s.owner_company} for s in paginated_ships.items],
        'total': paginated_ships.total,
        'pages': paginated_ships.pages,
        'current_page': paginated_ships.page
    })

@app.route('/api/ships/<int:ship_id>', methods=['GET'])
@jwt_required()
def get_ship_details(ship_id):
    ship = db.session.get(Ship, ship_id)
    if not ship:
        return jsonify({'success': False, 'error': ERROR_MESSAGES["NOT_FOUND"]}), 404
    return jsonify({
        'success': True,
        'ship': {'id': ship.id, 'name': ship.name, 'imo_number': ship.imo_number, 'type': ship.type, 'owner_company': ship.owner_company}
    })

@app.route('/api/ships/<int:ship_id>', methods=['DELETE'])
@jwt_required()
def delete_ship(ship_id):
    current_user_id = get_jwt_identity()
    ship = db.session.get(Ship, ship_id)
    if not ship:
        return jsonify({'success': False, 'error': ERROR_MESSAGES["NOT_FOUND"]}), 404
    
    try:
        components_to_update = Component.query.filter(
            Component.ship_id == ship_id,
            Component.status != 'Списан'
        ).all()

        for component in components_to_update:
            component.status = 'Списан'
            
            new_update = ComponentUpdate(
                component_id=component.id, 
                user_id=current_user_id,
                update_name="Списание при удалении судна", 
                update_date=datetime.now().date(),
                new_status='Списан',
                notes=f"Компонент списан автоматически при удалении судна '{ship.name}'."
            )
            db.session.add(new_update)
        
        db.session.delete(ship)
        
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Судно и все его компоненты были успешно удалены'})

    except Exception as e:
        db.session.rollback()
        app.logger.error(f"DB error during ship deletion {ship_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': ERROR_MESSAGES["INTERNAL_ERROR"]}), 500

@app.route('/api/ships/<int:ship_id>/components', methods=['POST'])
@jwt_required()
def add_component_to_ship(ship_id):
    current_user_id = get_jwt_identity()
    
    ship = db.session.get(Ship, ship_id)
    if not ship:
        return jsonify({'success': False, 'error': ERROR_MESSAGES['NOT_FOUND'] + " (ship)"}), 404

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': "Отсутствует тело запроса"}), 400
        
    required_fields = ['name', 'component_type_id', 'service_life_months', 'last_inspection_date']
    if not all(field in data for field in required_fields):
        return jsonify({'success': False, 'error': ERROR_MESSAGES['MISSING_FIELDS']}), 400

    try:
        name = data['name']
        component_type_id = int(data['component_type_id'])
        service_life_months = int(data['service_life_months'])
        last_inspection_date = datetime.strptime(data['last_inspection_date'], '%Y-%m-%d').date()
        serial_number = data.get('serial_number')
        status = data.get('status', 'Рабочий')

        if not (1 <= len(name) <= 32):
            return jsonify({'success': False, 'error': ERROR_MESSAGES['INVALID_LENGTH'] + " (name: 1-32)"}), 400
        if serial_number and len(serial_number) > 50:
             return jsonify({'success': False, 'error': ERROR_MESSAGES['INVALID_LENGTH'] + " (serial_number: max 50)"}), 400
        if not (0 < service_life_months <= 600):
            return jsonify({'success': False, 'error': 'Срок службы должен быть в диапазоне от 1 до 600 месяцев.'}), 400
        if not db.session.get(ComponentType, component_type_id):
            return jsonify({'success': False, 'error': ERROR_MESSAGES['NOT_FOUND'] + " (component_type)"}), 400

    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Неверный тип данных для одного из полей.'}), 400

    try:
        new_component = Component(name=name, ship_id=ship_id, component_type_id=component_type_id,
                                  serial_number=serial_number, service_life_months=service_life_months,
                                  last_inspection_date=last_inspection_date, status=status)
        db.session.add(new_component)
        db.session.commit()
        app.logger.info(f"User {current_user_id} created new component '{new_component.name}' (ID: {new_component.id}) for ship {ship_id}")
        return jsonify({'success': True, 'message': 'Компонент успешно добавлен', 'component': {'id': new_component.id,'name': new_component.name,'status': new_component.status}}), 201
        
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"DB error creating component for ship {ship_id} by user {current_user_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': ERROR_MESSAGES['INTERNAL_ERROR']}), 500

@app.route('/api/ships/<int:ship_id>/components', methods=['GET'])
@jwt_required()
def handle_ship_components(ship_id):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    paginated_components = Component.query.filter_by(ship_id=ship_id).paginate(page=page, per_page=per_page, error_out=False)
    return jsonify({'success': True,
                     'components': [{
                        'id': c.id, 
                        'name': c.name, 
                        'component_type_id': c.component_type_id, 
                        'status': c.status} for c in paginated_components.items], 
                        'total': paginated_components.total, 
                        'pages': paginated_components.pages, 
                        'current_page': paginated_components.page})

@app.route('/api/components/<int:component_id>', methods=['GET'])
@jwt_required()
def get_component_info(component_id):
    component = db.session.get(Component, component_id)
    if not component:
        return jsonify({'success': False, 'error': ERROR_MESSAGES["NOT_FOUND"]}), 404
    
    ship = db.session.get(Ship, component.ship_id)
    component_type = db.session.get(ComponentType, component.component_type_id)
    return jsonify({'success': True, 'id': component.id, 'name': component.name,'ship': {
        'id': ship.id,
        'name': ship.name
        } if ship else None,'component_type': {
            'id': component_type.id,
            'name': component_type.name
            } if component_type else None,
            'serial_number': component.serial_number,
            'service_life_months': component.service_life_months,
            'last_inspection_date': component.last_inspection_date.strftime('%Y-%m-%d'),
            'status': component.status,})

@app.route('/api/components/<int:component_id>', methods=['DELETE'])
@jwt_required()
def delete_component(component_id):
    current_user_id = get_jwt_identity()
    component = db.session.get(Component, component_id)
    if not component:
        return jsonify({'success': False, 'error': ERROR_MESSAGES["NOT_FOUND"]}), 404
    
    if component.status != 'Списан':
        return jsonify({'success': False, 'error': ERROR_MESSAGES["CANNOT_DELETE_ACTIVE"]}), 403
    
    try:
        db.session.delete(component)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Компонент успешно удален'})
    except Exception as e:
        db.session.rollback()
        app.logger.error(f"DB error deleting component {component_id}: {e}", exc_info=True)
        return jsonify({'success': False, 'error': ERROR_MESSAGES["INTERNAL_ERROR"]}), 500

@app.route('/api/components/<int:component_id>/updates', methods=['GET'])
@jwt_required()
def get_component_updates(component_id):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 5, type=int)
    query = ComponentUpdate.query.options(joinedload(ComponentUpdate.user)).filter_by(component_id=component_id).order_by(ComponentUpdate.update_date.desc())
    paginated_updates = query.paginate(page=page, per_page=per_page, error_out=False)
    updates = []
    for u in paginated_updates.items:
        update_data = {'id': u.id, 'update_name': u.update_name, 'update_date': u.update_date.strftime('%Y-%m-%d'), 'new_status': u.new_status, 'notes': u.notes, 'user': {'id': u.user.id, 'username': u.user.username} if u.user else None}
        updates.append(update_data)
    return jsonify({'success': True, 'updates': updates, 'total': paginated_updates.total, 'pages': paginated_updates.pages, 'current_page': paginated_updates.page})

@app.route('/api/components/<int:component_id>/update_status', methods=['POST'])
@jwt_required()
def update_component_status(component_id):
    current_user_id = get_jwt_identity()
    data = request.get_json()
    if not data or not data.get('update_name') or not data.get('new_status'):
        return jsonify({'success': False, 'error': ERROR_MESSAGES["MISSING_FIELDS"]}), 400

    update_name = data.get('update_name')
    if len(update_name) > 32:
        return jsonify({'success': False, 'error': ERROR_MESSAGES['INVALID_LENGTH'] + " (update_name: max 32)"}), 400

    component = db.session.get(Component, component_id)
    if not component:
        return jsonify({'success': False, 'error': ERROR_MESSAGES["NOT_FOUND"]}), 404

    try:
        notes = data.get('notes', '')
        if 'service_life_months' in data and data.get('service_life_months') is not None:
            new_service_life = int(data['service_life_months'])
            if not (0 < new_service_life <= 600):
                return jsonify({'success': False, 'error': 'Срок службы должен быть в диапазоне от 1 до 600 месяцев.'}), 400
            
            old_service_life = component.service_life_months
            component.service_life_months = new_service_life
            notes += f"\n(Срок службы обновлен с {old_service_life} до {new_service_life} мес.)"

        component.status = data['new_status']
        component.last_inspection_date = datetime.now().date()
        
        new_update = ComponentUpdate(component_id=component_id, user_id=current_user_id, update_name=update_name, update_date=datetime.now().date(), new_status=data['new_status'], notes=notes.strip())
        db.session.add(new_update)
        db.session.commit()
        return jsonify({'success': True, 'message': 'Статус компонента обновлен'})
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Некорректное значение для срока службы.'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': ERROR_MESSAGES["INTERNAL_ERROR"]}), 500

@app.route('/api/expiring_components', methods=['GET'])
@jwt_required()
def get_expiring_components():
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 10, type=int)
    today = datetime.now().date()
    
    expiration_date_col = (Component.last_inspection_date + 
                           (Component.service_life_months * text("'1 month'::interval"))
                          ).label('expiration_date')
    
    days_remaining_col = (func.date(expiration_date_col) - func.current_date()).label('days_remaining')

    query = db.session.query(
        Component, 
        expiration_date_col,
        days_remaining_col
    ).filter(
        expiration_date_col.between(today, today + timedelta(days=90))
    ).order_by(
        expiration_date_col.asc()
    )
    
    paginated_data = query.paginate(page=page, per_page=per_page, error_out=False)
    
    result = []
    for c, exp_date, days_rem in paginated_data.items:
        result.append({
            'id': c.id, 
            'name': c.name, 
            'ship_id': c.ship_id,
            'component_type_id': c.component_type_id,
            'status': c.status,
            'expiration_date': exp_date.strftime('%Y-%m-%d'),
            'days_remaining': days_rem
        })
        
    return jsonify({
        'success': True, 
        'expiring_components': result, 
        'total': paginated_data.total,
        'pages': paginated_data.pages,
        'current_page': paginated_data.page
    })

@app.route('/api/component_types', methods=['GET'])
@jwt_required()
def get_component_types():
    component_types = ComponentType.query.all()
    return jsonify({'success': True, 'component_types': [{'id': ct.id, 'name': ct.name} for ct in component_types]})

@app.route('/api/subscriptions', methods=['GET'])
@jwt_required()
def get_user_subscriptions():
    current_user_id = get_jwt_identity()
    subscriptions = ComponentSubscription.query.filter_by(user_id=current_user_id).all()
    return jsonify({'success': True, 'subscribed_type_ids': [s.component_type_id for s in subscriptions]})

@app.route('/api/subscribe_component_type', methods=['POST'])
@jwt_required()
def subscribe_component_type():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    component_type_name = data.get('component_type_name')
    if not component_type_name:
        return jsonify({'success': False, 'error': ERROR_MESSAGES["MISSING_FIELDS"] + " (требуется component_type_name)"}), 400
    component_type = ComponentType.query.filter_by(name=component_type_name).first()
    if not component_type:
        return jsonify({'success': False, 'error': ERROR_MESSAGES["NOT_FOUND"] + f" (тип компонента '{component_type_name}' не найден)"}), 404
    component_type_id = component_type.id
    if ComponentSubscription.query.filter_by(user_id=current_user_id, component_type_id=component_type_id).first():
        return jsonify({'success': False, 'error': ERROR_MESSAGES["ALREADY_EXISTS"]}), 409
    new_sub = ComponentSubscription(user_id=current_user_id, component_type_id=component_type_id)
    db.session.add(new_sub)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Подписка успешно оформлена'}), 201

@app.route('/api/unsubscribe_component_type', methods=['POST'])
@jwt_required()
def unsubscribe_component_type():
    current_user_id = get_jwt_identity()
    data = request.get_json()
    component_type_id = data.get('component_type_id')
    subscription = ComponentSubscription.query.filter_by(user_id=current_user_id, component_type_id=component_type_id).first()
    if not subscription:
        return jsonify({'success': False, 'error': ERROR_MESSAGES["NOT_FOUND"]}), 404
    db.session.delete(subscription)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Вы успешно отписались'})

@app.after_request
def log_request_info(response):
    if request.method == 'OPTIONS':
        return response

    user_identity = "Anonymous"
    try:
        if has_request_context() and get_jwt():
            user_identity = f"User<{get_jwt_identity()}>"
    except Exception:
        pass

    full_path = request.path
    if request.args:
        full_path += f"?{request.query_string.decode('utf-8')}"
    
    if 400 <= response.status_code < 500:
        log_level = app.logger.warning
    elif response.status_code >= 500:
        log_level = app.logger.error
    else:
        log_level = app.logger.info

    log_level(
        f'{user_identity} :: "{request.method} {full_path}" :: {response.status}'
    )
    return response

@app.route('/api/health')
def health_check():
    return jsonify(status="ok"), 200

if __name__ == '__main__':
    app.logger.info("Starting Flask application...")
    app.run(host='0.0.0.0', port=5252, debug=False)