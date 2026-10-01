from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def index(request):
    """Panel de control: ajustes generales de la aplicación."""
    return render(request, 'config/panel.html')