terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = "478e31b9-2fe0-4f99-ad5d-47fdf29dbd01"
}

resource "random_password" "sql_admin_password" {
  length           = 20
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "random_string" "suffix" {
  length  = 6
  upper   = false
  special = false
}

locals {
  location            = "polandcentral"
  resource_group_name = "rg-iot-cloud-terraform"
  app_name            = "iot-cloud-merchel-tf"
  acr_name            = "acriotcloudamerchel"
  image_name          = "iot-cloud-app"
  image_tag           = "latest"
  sql_server_name     = "sql-iot-cloud-${random_string.suffix.result}"
  sql_database_name   = "iottelemetrydb"
  sql_admin_login     = "sqladminuser"
}

resource "azurerm_resource_group" "rg" {
  name     = local.resource_group_name
  location = local.location
}

data "azurerm_container_registry" "acr" {
  name                = local.acr_name
  resource_group_name = "rg-iot-cloud"
}

resource "azurerm_mssql_server" "sql_server" {
  name                         = local.sql_server_name
  resource_group_name          = azurerm_resource_group.rg.name
  location                     = azurerm_resource_group.rg.location
  version                      = "12.0"
  administrator_login          = local.sql_admin_login
  administrator_login_password = random_password.sql_admin_password.result
}

resource "azurerm_mssql_database" "sql_database" {
  name      = local.sql_database_name
  server_id = azurerm_mssql_server.sql_server.id
  sku_name  = "Basic"

  geo_backup_enabled  = false
  storage_account_type = "Local"
}

resource "azurerm_mssql_firewall_rule" "allow_azure_services" {
  name             = "AllowAzureServices"
  server_id        = azurerm_mssql_server.sql_server.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

resource "azurerm_service_plan" "plan" {
  name                = "plan-iot-cloud-terraform"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "B1"
}

resource "azurerm_linux_web_app" "webapp" {
  name                = local.app_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  service_plan_id     = azurerm_service_plan.plan.id

  identity {
    type = "SystemAssigned"
  }

  site_config {
    application_stack {
      docker_image_name   = "${local.image_name}:${local.image_tag}"
      docker_registry_url = "https://${data.azurerm_container_registry.acr.login_server}"
    }

    always_on = true
  }

  app_settings = {
    WEBSITES_PORT = "8080"

    DB_SERVER   = azurerm_mssql_server.sql_server.fully_qualified_domain_name
    DB_DATABASE = azurerm_mssql_database.sql_database.name
    DB_USER     = local.sql_admin_login
    DB_PASSWORD = random_password.sql_admin_password.result
  }
}

resource "azurerm_role_assignment" "acr_pull" {
  scope                = data.azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.webapp.identity[0].principal_id
}

output "webapp_url" {
  value = "https://${azurerm_linux_web_app.webapp.default_hostname}"
}

output "sql_server_name" {
  value = azurerm_mssql_server.sql_server.fully_qualified_domain_name
}

output "sql_database_name" {
  value = azurerm_mssql_database.sql_database.name
}

output "sql_password" {
  value     = random_password.sql_admin_password.result
  sensitive = true
}