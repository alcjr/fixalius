from django.urls import path
from . import views

app_name = "sources"

urlpatterns = [
    path("",              views.dashboard,    name="dashboard"),
    path("aplicaciones/", views.applications, name="applications"),
    path("clientes/",     views.clients,      name="clients"),

    # API
    path("api/cases/",              views.case_api,          name="api_case_list"),
    path("api/cases/<int:pk>/",     views.case_detail_api,   name="api_case_detail"),
    path("api/clients/",            views.client_api,        name="api_client_list"),
    path("api/clients/<int:pk>/",   views.client_detail_api, name="api_client_detail"),  
]