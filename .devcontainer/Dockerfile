FROM node:14-bullseye

# node may come with an older version of npm. Ensure we have a specific npm.
#RUN npm install -g npm@6.14.14


# add a repository that has a newer version of Git than the one available in the default Debian Jessie repository
#RUN echo "deb http://ftp.debian.org/debian stretch main" | tee -a /etc/apt/sources.list

################################################################################
# Install prerequisites
RUN apt update
RUN apt install -y \
    curl \
    git \
    xdg-utils



# Add non-root user
ARG USERNAME=node
ARG USER_UID=1000
ARG USER_GID=$USER_UID


# Create the user (don't need to if it already exists)
#RUN groupadd --gid $USER_GID $USERNAME \
#    && useradd --uid $USER_UID --gid $USER_GID -m $USERNAME \
    #
    # [Optional] Add sudo support. Omit if you don't need to install software after connecting.
RUN apt update \
    && apt install -y sudo \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

## Make sure to reflect new user in PATH
#ENV PATH="/home/${USERNAME}/.local/bin:${PATH}"
USER $USERNAME


###### Install NVM ################################################################################
# Install nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.37.0/install.sh | bash
ENV NVM_DIR /home/node/.nvm
RUN . $NVM_DIR/nvm.sh \
    && nvm install 14 \
    && nvm use 14 \
    && nvm install-latest-npm

###### Finished install  NVM ################################################################################
