# KinCast for HardyOS

This folder is KinCast's one-click app package for [HardyOS](https://github.com/HARDYOS/HARDYOS).
The **Build HardyOS package** workflow turns it into `kincast.hardyapp`:

- on every push to `main`, as a workflow artifact (follows the `latest` images);
- on every `v*` tag, attached to the GitHub release, pinned to that version's images.

To install: in HardyOS, open **App Store**. KinCast is in **Discover**, or use
**Upload a package** with a `kincast.hardyapp` from a release. HardyOS asks
for the pool, ports (website 8095, live streaming 1935 by default) and a few
settings, generates the database and session passwords, downloads the images
and starts KinCast. Then open it to create your family and admin account.

Files:

- `hardyapp.json`: name, ports, settings and folders (format: HardyOS `docs/apps.md`)
- `compose.yaml`: Postgres, the KinCast app and the streaming server, using the
  `HARDY_*` variables HardyOS fills in
- `icon.svg`: the App Store icon

Build it by hand with `tar -czf kincast.hardyapp -C hardyos hardyapp.json compose.yaml icon.svg`,
or with `hardyctl app-pack hardyos` on a HardyOS server.
