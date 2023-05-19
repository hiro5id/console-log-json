# Getting the correct node version environment when running over remote SSH connection in docker container

1. Check what is the required version for the project by running nvm use within the directory to pick up the version defined in .nvmrc
```
    nvm use
```

2. Set the default node alias so that when the container restarts it will use that node version:
```
    nvm alias default <the version, ex: 14>
```

3. Kill VS Code server to force it to restart using `Remote-SSH: Kill VS Code Server on Host...` **make sure all sessions are closed before you attempt this** so that it properly restarts. (close all vs code windows)

**OR**

Restart the container on the remote host:
```
    sudo docker restart <container name ex: nodejs_dev>
```

1. Reconnect VS Code via `Remote-SSH: Connect To Host...`
