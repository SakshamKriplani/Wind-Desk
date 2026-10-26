import pytest
from fastapi.testclient import TestClient

from app.store import store
from tests.synthetic import make_dataset


@pytest.fixture(scope="session")
def ds():
    return make_dataset()


@pytest.fixture(scope="session")
def client(ds):
    store.set(ds)
    from app.main import app
    return TestClient(app)
