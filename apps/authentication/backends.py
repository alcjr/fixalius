from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend


class EmailOrUsernameBackend(ModelBackend):
    """Permite entrar con el nombre de usuario o con el correo electrónico.

    - Primero busca por nombre de usuario (como el backend por defecto).
    - Si no hay coincidencia, busca por correo sin distinguir mayúsculas,
      pero solo si ese correo pertenece a un único usuario. Con correos
      repetidos no se adivina: se rechaza el acceso.
    Hereda de ModelBackend, así que permisos y comprobación de is_active
    siguen funcionando igual.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        UserModel = get_user_model()
        if username is None:
            username = kwargs.get(UserModel.USERNAME_FIELD)
        if not username or password is None:
            return None

        user = UserModel._default_manager.filter(
            **{UserModel.USERNAME_FIELD: username}
        ).first()
        if user is None:
            candidatos = list(
                UserModel._default_manager.filter(email__iexact=username)[:2]
            )
            if len(candidatos) == 1:
                user = candidatos[0]

        if user is None:
            # Mismo coste de CPU que un usuario real: evita distinguir
            # "no existe" de "contraseña mala" por el tiempo de respuesta.
            UserModel().set_password(password)
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
