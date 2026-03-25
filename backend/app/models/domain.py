from pydantic import BaseModel, Field, validator
from typing import Optional
from datetime import datetime

class Customer(BaseModel):
    customer_id: str
    name: str
    industry: Optional[str] = "Unknown"
    
class Product(BaseModel):
    product_id: str
    description: str
    category: Optional[str] = "General"

class SalesOrder(BaseModel):
    order_id: str
    customer_id: str
    product_id: str
    order_date: datetime
    amount: float

class Delivery(BaseModel):
    delivery_id: str
    order_id: str
    plant_id: str
    delivery_date: datetime
    status: str

class BillingDocument(BaseModel):
    billing_id: str
    delivery_id: str
    billing_date: datetime
    amount: float
    status: str 