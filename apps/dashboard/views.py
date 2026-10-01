from django.contrib.auth.decorators import login_required
from django.shortcuts import render


@login_required
def index(request):
    """Página principal del dashboard (intranet)."""
    return render(request, 'dashboard/dashboard.html')