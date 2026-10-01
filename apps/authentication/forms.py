from django import forms
from django.contrib.auth.forms import (
    AuthenticationForm,
    PasswordResetForm,
    SetPasswordForm,
)


class FixaliusAuthenticationForm(AuthenticationForm):
    """AuthenticationForm con atributos que los gestores de contraseñas
    y los teclados móviles aprovechan (autocomplete, autocapitalize…)."""

    username = forms.CharField(
        label="Usuario o correo electrónico",
        widget=forms.TextInput(attrs={
            'autocomplete': 'username',
            'autocapitalize': 'none',
            'autocorrect': 'off',
            'spellcheck': 'false',
            'autofocus': True,
        }),
    )
    password = forms.CharField(
        label="Contraseña",
        strip=False,
        widget=forms.PasswordInput(attrs={
            'autocomplete': 'current-password',
        }),
    )


class FixaliusPasswordResetForm(PasswordResetForm):
    email = forms.EmailField(
        label="Correo electrónico",
        max_length=254,
        widget=forms.EmailInput(attrs={
            'autocomplete': 'email',
            'autofocus': True,
        }),
    )


class FixaliusSetPasswordForm(SetPasswordForm):
    new_password1 = forms.CharField(
        label="Nueva contraseña",
        strip=False,
        widget=forms.PasswordInput(attrs={
            'autocomplete': 'new-password',
            'autofocus': True,
        }),
    )
    new_password2 = forms.CharField(
        label="Confirmar contraseña",
        strip=False,
        widget=forms.PasswordInput(attrs={
            'autocomplete': 'new-password',
        }),
    )