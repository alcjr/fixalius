from django.shortcuts import render


def home(request):
    """Página pública de inicio."""
    return render(request, 'core/index.html')