from django.conf import settings
from django.db import models


class Profile(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    is_pre_registered = models.BooleanField(default=True)

    def __str__(self):
        return f"Profile for {self.user.username}"
