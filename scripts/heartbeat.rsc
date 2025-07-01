# Mikrotik script to send heartbeat to monitoring service
# Replace 192.168.1.100 with your monitoring server IP or domain
:local ddns [/ip cloud get dns-name]
/tool fetch url="http://192.168.1.100:4000/ping?cloud=$ddns" keep-result=no
# Schedule every 5 minutes with:
# /system scheduler add name=heartbeat interval=5m on-event="/system script run heartbeat"
