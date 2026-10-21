# Read-only. Run in PowerShell on the Predator laptop before changing Windows.
$ErrorActionPreference = 'Continue'
Write-Output 'CPU'
Get-CimInstance Win32_Processor | Select-Object Name, NumberOfCores, NumberOfLogicalProcessors
Write-Output 'Memory'
Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, TotalPhysicalMemory
Write-Output 'GPU'
Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, AdapterRAM
Write-Output 'Disk health and partitions'
Get-PhysicalDisk | Select-Object FriendlyName, MediaType, HealthStatus, Size
Get-Volume | Select-Object DriveLetter, FileSystem, Size, SizeRemaining
Write-Output 'Network'
Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, LinkSpeed
Get-NetIPConfiguration | Select-Object InterfaceAlias, IPv4Address, IPv4DefaultGateway
Write-Output 'Power and firmware'
powercfg /a
Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion
Write-Output 'No installation, configuration, data deletion or repartitioning performed.'
