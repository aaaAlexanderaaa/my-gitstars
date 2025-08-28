"use client"

import type React from "react"

import { useEffect, useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { TagFilterPanel } from "@/components/tag-filter-panel"
import { RepositoryDetailsModal } from "@/components/repository-details-modal"
import { LogOut, RefreshCw, Search, Star, Plus, X } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"


interface User {
  id: number
  githubId: string
  username: string
  avatarUrl: string
}

interface Repository {
  id: number
  githubId: string
  name: string
  fullName: string
  description: string
  url: string
  customTags: string[]
  starredAt: string
  language: string
  owner: string
  topics: string[]
  fork: boolean
  forksCount: number
  stargazersCount: number
  watchersCount: number
  defaultBranch: string
  isTemplate: boolean
  archived: boolean
  visibility: string
  pushedAt: string
  githubCreatedAt: string
  githubUpdatedAt: string
  latestVersion: string
  currentlyUsedVersion: string
  updateAvailable: boolean
  hasReleases: boolean
  releasesLastFetched: string
  createdAt: string
  updatedAt: string
  UserId: number
  effectiveVersion: string
  latestRelease?: {
    tagName: string
    name: string
    body: string
    publishedAt: string
    isPrerelease: boolean
    isDraft: boolean
  }
}

interface TagCount {
  tag: string
  count: number
  type: "language" | "topic" | "custom"
}

interface AdvancedFilter {
  id: string
  expression: string
}

const mockUser: User = {
  id: 1,
  githubId: "123456",
  username: "test",
  avatarUrl: "https://avatars.githubusercontent.com/u/123456?v=4",
}

const mockRepositories: Repository[] = [
  {
    id: 8265,
    githubId: "121898717",
    name: "vaultwarden",
    fullName: "dani-garcia/vaultwarden",
    description: "Unofficial Bitwarden compatible server written in Rust, formerly known as bitwarden_rs",
    url: "https://github.com/dani-garcia/vaultwarden",
    customTags: ["tools", "in-using", "in-changed"],
    starredAt: "2024-12-27T08:18:30.000Z",
    language: "Rust",
    owner: "dani-garcia",
    topics: ["bitwarden", "bitwarden-rs", "docker", "rocket", "rust", "vaultwarden"],
    fork: false,
    forksCount: 2252,
    stargazersCount: 47783,
    watchersCount: 47783,
    defaultBranch: "main",
    isTemplate: false,
    archived: false,
    visibility: "public",
    pushedAt: "2025-08-10T17:07:05.000Z",
    githubCreatedAt: "2018-02-17T22:40:20.000Z",
    githubUpdatedAt: "2025-08-11T07:18:30.000Z",
    latestVersion: "1.34.3",
    currentlyUsedVersion: "1.34.1",
    updateAvailable: true,
    hasReleases: true,
    releasesLastFetched: "2025-08-16T13:08:04.695Z",
    createdAt: "2024-12-29T02:54:39.596Z",
    updatedAt: "2025-08-16T13:08:04.695Z",
    UserId: 1,
    effectiveVersion: "1.34.1",
    latestRelease: {
      tagName: "1.34.3",
      name: "1.34.3",
      body: "## Notable changes\r\nThis release should fix an issue with MySQL/MariaDB database connections when using the Alpine images.\r\nThe alpine build image has reverted to use MariaDB Connector/C v3.4.5 which resolved the issue.\r\n\r\n## What's Changed\r\n* Update crates to trigger rebuild for mysql issue by @BlackDex in https://github.com/dani-garcia/vaultwarden/pull/6111\r\n* fix hiding of signup link by @stefan0xC in https://github.com/dani-garcia/vaultwarden/pull/6113\r\n\r\n\r\n**Full Changelog**: https://github.com/dani-garcia/vaultwarden/compare/1.34.2...1.34.3",
      publishedAt: "2025-07-30T09:10:59.000Z",
      isPrerelease: false,
      isDraft: false,
    },
  },
  {
    id: 6483,
    githubId: "307260205",
    name: "yt-dlp",
    fullName: "yt-dlp/yt-dlp",
    description: "A feature-rich command-line audio/video downloader",
    url: "https://github.com/yt-dlp/yt-dlp",
    customTags: ["tools", "in-using", "something-funny"],
    starredAt: "2024-12-25T15:30:46.000Z",
    language: "Python",
    owner: "yt-dlp",
    topics: ["cli", "downloader", "python", "sponsorblock", "youtube-dl", "youtube-downloader", "yt-dlp"],
    fork: false,
    forksCount: 9701,
    stargazersCount: 121988,
    watchersCount: 121988,
    defaultBranch: "master",
    isTemplate: false,
    archived: false,
    visibility: "public",
    pushedAt: "2025-08-11T04:00:55.000Z",
    githubCreatedAt: "2020-10-26T04:22:55.000Z",
    githubUpdatedAt: "2025-08-11T07:51:40.000Z",
    latestVersion: "2025.08.11",
    currentlyUsedVersion: "2025.05.22",
    updateAvailable: true,
    hasReleases: true,
    releasesLastFetched: "2025-08-16T13:08:06.047Z",
    createdAt: "2024-12-25T15:48:29.419Z",
    updatedAt: "2025-08-16T13:08:06.047Z",
    UserId: 1,
    effectiveVersion: "2025.05.22",
    latestRelease: {
      tagName: "2025.08.11",
      name: "yt-dlp 2025.08.11",
      body: '[![Installation](https://img.shields.io/badge/-Which%20file%20to%20download%3F-white.svg?style=for-the-badge)](https://github.com/yt-dlp/yt-dlp#installation "Installation instructions") [![Discord](https://img.shields.io/discord/807245652072857610?color=blue&labelColor=555555&label=&logo=discord&style=for-the-badge)](https://discord.gg/H5MNcFW63r "Discord") [![Donate](https://img.shields.io/badge/_-Donate-red.svg?logo=githubsponsors&labelColor=555555&style=for-the-badge)](https://github.com/yt-dlp/yt-dlp/blob/master/Collaborators.md#collaborators "Donate") [![Documentation](https://img.shields.io/badge/-Docs-brightgreen.svg?style=for-the-badge&logo=GitBook&labelColor=555555)](https://github.com/yt-dlp/yt-dlp/tree/2025.08.11#readme "Documentation") [![Nightly](https://img.shields.io/badge/Nightly%20builds-purple.svg?style=for-the-badge)](https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest "Nightly builds") [![Master](https://img.shields.io/badge/Master%20builds-lightblue.svg?style=for-the-badge)](https://github.com/yt-dlp/yt-dlp-master-builds/releases/latest "Master builds")\r\n\r\n#### A description of the various files is in the [README](https://github.com/yt-dlp/yt-dlp#release-files)\r\n---\r\n\r\n#### Important changes\r\n- **The minimum *recommended* Python version has been raised to 3.10**\r\nSince Python 3.9 will reach end-of-life in October 2025, support for it will be dropped soon. [Read more](https://github.com/yt-dlp/yt-dlp/issues/13858)\r\n- **darwin_legacy_exe builds are being discontinued**\r\nThis release\'s `yt-dlp_macos_legacy` binary will likely be the last one. [Read more](https://github.com/yt-dlp/yt-dlp/issues/13856)\r\n- **linux_armv7l_exe builds are being discontinued**\r\nThis release\'s `yt-dlp_linux_armv7l` binary could be the last one. [Read more](https://github.com/yt-dlp/yt-dlp/issues/13976)\r\n\r\n<details><summary><h3>Changelog</h3></summary>\r\n\r\n\r\n#### Core changes\r\n- [Deprecate `darwin_legacy_exe` support](https://github.com/yt-dlp/yt-dlp/commit/cc5a5caac5fbc0d605b52bde0778d6fd5f97b5ab) ([#13857](https://github.com/yt-dlp/yt-dlp/issues/13857)) by [bashonly](https://github.com/bashonly)\r\n- [Deprecate `linux_armv7l_exe` support](https://github.com/yt-dlp/yt-dlp/commit/c76ce28e06c816eb5b261dfb6aff6e69dd9b7382) ([#13978](https://github.com/yt-dlp/yt-dlp/issues/13978)) by [bashonly](https://github.com/bashonly)\r\n- [Raise minimum recommended Python version to 3.10](https://github.com/yt-dlp/yt-dlp/commit/23c658b9cbe34a151f8f921ab1320bb5d4e40a4d) ([#13859](https://github.com/yt-dlp/yt-dlp/issues/13859)) by [bashonly](https://github.com/bashonly)\r\n- [Warn when yt-dlp is severely outdated](https://github.com/yt-dlp/yt-dlp/commit/662af5bb8307ec3ff8ab0857f1159922d64792f0) ([#13937](https://github.com/yt-dlp/yt-dlp/issues/13937)) by [seproDev](https://github.com/seproDev)\r\n- **cookies**: [Load cookies with float `expires` timestamps](https://github.com/yt-dlp/yt-dlp/commit/28b68f687561468e0c664dcb430707458970019f) ([#13873](https://github.com/yt-dlp/yt-dlp/issues/13873)) by [bashonly](https://github.com/bashonly)\r\n- **utils**\r\n    - [Add `WINDOWS_VT_MODE` to globals](https://github.com/yt-dlp/yt-dlp/commit/eed94c7306d4ecdba53ad8783b1463a9af5c97f1) ([#12460](https://github.com/yt-dlp/yt-dlp/issues/12460)) by [Grub4K](https://github.com/Grub4K)\r\n    - `parse_resolution`: [Support width-only pattern](https://github.com/yt-dlp/yt-dlp/commit/4385480795acda35667be008d0bf26b46e9d65b4) ([#13802](https://github.com/yt-dlp/yt-dlp/issues/13802)) by [doe1080](https://github.com/doe1080)\r\n    - `random_user_agent`: [Bump versions](https://github.com/yt-dlp/yt-dlp/commit/c59ad2b066bbccd3cc4eed580842f961bce7dd4a) ([#13543](https://github.com/yt-dlp/yt-dlp/issues/13543)) by [bashonly](https://github.com/bashonly)\r\n\r\n#### Extractor changes\r\n- **archive.org**: [Fix metadata extraction](https://github.com/yt-dlp/yt-dlp/commit/42ca3d601ee10cef89d698f72e2b5d44fab4f013) ([#13880](https://github.com/yt-dlp/yt-dlp/issues/13880)) by [bashonly](https://github.com/bashonly)\r\n- **digitalconcerthall**: [Fix formats extraction](https://github.com/yt-dlp/yt-dlp/commit/e8d2807296ccc603e031f5982623a8311f2a5119) ([#13948](https://github.com/yt-dlp/yt-dlp/issues/13948)) by [bashonly](https://github.com/bashonly)\r\n- **eagleplatform**: [Remove extractors](https://github.com/yt-dlp/yt-dlp/commit/1fe83b0111277a6f214c5ec1819cfbf943508baf) ([#13469](https://github.com/yt-dlp/yt-dlp/issues/13469)) by [doe1080](https://github.com/doe1080)\r\n- **fauliolive**\r\n    - [Add extractor](https://github.com/yt-dlp/yt-dlp/commit/3e609b2cedd285739bf82c7af7853735092070a4) ([#13421](https://github.com/yt-dlp/yt-dlp/issues/13421)) by [CasperMcFadden95](https://github.com/CasperMcFadden95), [seproDev](https://github.com/seproDev)\r\n    - [Support Bahry TV](https://github.com/yt-dlp/yt-dlp/commit/daa1859be1b0e7d123da8b4e0988f2eb7bd47d15) ([#13850](https://github.com/yt-dlp/yt-dlp/issues/13850)) by [CasperMcFadden95](https://github.com/CasperMcFadden95)\r\n- **fc2**: [Fix old video support](https://github.com/yt-dlp/yt-dlp/commit/cd31c319e3142622ec43c49485d196ed2835df05) ([#12633](https://github.com/yt-dlp/yt-dlp/issues/12633)) by [JChris246](https://github.com/JChris246), [seproDev](https://github.com/seproDev)\r\n- **motherless**: [Fix extractor](https://github.com/yt-dlp/yt-dlp/commit/e8d49b1c7f11c7e282319395ca9c2a201304be41) ([#13960](https://github.com/yt-dlp/yt-dlp/issues/13960)) by [Grub4K](https://github.com/Grub4K)\r\n- **n1info**: article: [Fix extractor](https://github.com/yt-dlp/yt-dlp/commit/6539ee1947d7885d3606da6365fd858308435a63) ([#13865](https://github.com/yt-dlp/yt-dlp/issues/13865)) by [u-spec-png](https://github.com/u-spec-png)\r\n- **neteasemusic**: [Support XFF](https://github.com/yt-dlp/yt-dlp/commit/e8c2bf798b6707d27fecde66161172da69c7cd72) ([#11044](https://github.com/yt-dlp/yt-dlp/issues/11044)) by [c-basalt](https://github.com/c-basalt)\r\n- **niconico**: [Fix error handling & improve metadata extraction](https://github.com/yt-dlp/yt-dlp/commit/05e553e9d1f57655d65c9811d05df38261601b85) ([#13240](https://github.com/yt-dlp/yt-dlp/issues/13240)) by [doe1080](https://github.com/doe1080)\r\n- **parlview**: [Rework extractor](https://github.com/yt-dlp/yt-dlp/commit/485de69dbfeb7de7bcf9f7fe16d6c6ba9e81e1a0) ([#13788](https://github.com/yt-dlp/yt-dlp/issues/13788)) by [barryvan](https://github.com/barryvan)\r\n- **plyrembed**: [Add extractor](https://github.com/yt-dlp/yt-dlp/commit/61d4cd0bc01be6ebe11fd53c2d3805d1a2058990) ([#13836](https://github.com/yt-dlp/yt-dlp/issues/13836)) by [seproDev](https://github.com/seproDev)\r\n- **royalive**: [Support `en` URLs](https://github.com/yt-dlp/yt-dlp/commit/43dedbe6394bdd489193b15ee9690a62d1b82d94) ([#13908](https://github.com/yt-dlp/yt-dlp/issues/13908)) by [CasperMcFadden95](https://github.com/CasperMcFadden95)\r\n- **rtve.es**: program: [Add extractor](https://github.com/yt-dlp/yt-dlp/commit/b831406a1d3be34c159835079d12bae624c43610) ([#12955](https://github.com/yt-dlp/yt-dlp/issues/12955)) by [meGAmeS1](https://github.com/meGAmeS1), [seproDev](https://github.com/seproDev)\r\n- **shiey**: [Add extractor](https://github.com/yt-dlp/yt-dlp/commit/6ff135c31914ea8b5545f8d187c60e852cfde9bc) ([#13354](https://github.com/yt-dlp/yt-dlp/issues/13354)) by [iribeirocampos](https://github.com/iribeirocampos)\r\n- **sportdeuschland**: [Support embedded player URLs](https://github.com/yt-dlp/yt-dlp/commit/30302df22b7b431ce920e0f7298cd10be9989967) ([#13833](https://github.com/InvalidUsernameException)\r\n- **sproutvideo**: [Fix extractor](https://github.com/yt-dlp/yt-dlp/commit/59765ecbc08d18005de7143fbb1d1caf90239471) ([#13813](https://github.com/yt-dlp/yt-dlp/issues/13813)) by [bashonly](https://github.com/bashonly)\r\n- **tbs**: [Fix truTV support](https://github.com/yt-dlp/yt-dlp/commit/0adeb1e54b2d7e95cd19999e71013877850f8f41) ([#9683](https://github.com/yt-dlp/yt-dlp/issues/9683)) by [bashonly](https://github.com/bashonly), [ischmidt20](https://github.com/ischmidt20)\r\n- **tbsjp**: [Fix extractor](https://github.com/yt-dlp/yt-dlp/commit/71f30921a2023dbb25c53fd1bb1399cac803116d) ([#13485](https://github.com/yt-dlp/yt-dlp/issues/13485)) by [garret1317](https://github.com/garret1317)\r\n- **tver**\r\n    - [Extract Streaks API info](https://github.com/yt-dlp/yt-dlp/commit/70d7687487252a08dbf8b2831743e7833472ba05) ([#13885](https://github.com/yt-dlp/yt-dlp/issues/13885)) by [bashonly](https://github.com/bashonly)\r\n    - [Support --ignore-no-formats-error when geo-blocked](https://github.com/yt-dlp/yt-dlp/commit/121647705a2fc6b968278723fe61801007e228a4) ([#13598](https://github.com/yt-dlp/yt-dlp/issues/13598)) by [arabcoders](https://github.com/arabcoders)\r\n- **tvw**: news: [Add extractor](https://github.com/yt-dlp/yt-dlp/commit/682334e4b35112f7a5798decdcb5cb12230ef948) ([#12907](https://github.com/yt-dlp/yt-dlp/issues/12907)) by [fries1234](https://github.com/fries1234)\r\n- **vimeo**: [Fix login support and require authentication](https://github.com/yt-dlp/yt-dlp/commit/afaf60d9fd5a0c7a85aeb1374fd97fbc13cd652c) ([#13823](https://github.com/yt-dlp/yt-dlp/issues/13823)) by [bashonly](https://github.com/bashonly)\r\n- **yandexdisk**: [Support 360 URLs](https://github.com/yt-dlp/yt-dlp/commit/a6df5e8a58d6743dd230011389c986495ec509da) ([#13935](https://github.com/yt-dlp/yt-dlp/issues/13935)) by [Sojiroh](https://github.com/Sojiroh)\r\n- **youtube**\r\n    - [Add player params to mweb client](https://github.com/yt-dlp/yt-dlp/commit/38c2bf40260f7788efb5a7f5e8eba8e5cb43f741) ([#13914](https://github.com/yt-dlp/yt-dlp/issues/13914)) by [coletdjnz](https://github.com/coletdjnz)\r\n    - [Update player params](https://github.com/yt-dlp/yt-dlp/commit/bf366517ef0b745490ee9e0f929254fa26b69647) ([#13979](https://github.com/yt-dlp/yt-dlp/issues/13979)) by [bashonly](https://github.com/bashonly)\r\n\r\n#### Downloader changes\r\n- **dash**: [Re-extract if using --load-info-json with --live-from-start](https://github.com/yt-dlp/yt-dlp/commit/fe53ebe5b66a03c664708a4d6fd87b8c13a1bc7b) ([#13922](https://github.com/yt-dlp/yt-dlp/issues/13922)) by [bashonly](https://github.com/bashonly)\r\n- **external**: [Work around ffmpeg\'s `file:` URL handling](https://github.com/yt-dlp/yt-dlp/commit/d399505fdf8292332bdc91d33859a0b0d08104fd) ([#13844](https://github.com/yt-dlp/yt-dlp/issues/13844)) by [bashonly](https://github.com/bashonly)\r\n- **hls**: [Fix `--hls-split-continuity` support](https://github.com/yt-dlp/yt-dlp/commit/57186f958f164daa50203adcbf7ec74d541151cf) ([#13321](https://github.com/yt-dlp/yt-dlp/issues/13321)) by [tchebb](https://github.com/tchebb)\r\n\r\n#### Postprocessor changes\r\n- **embedthumbnail**: [Fix ffmpeg args for embedding in mp3](https://github.com/yt-dlp/yt-dlp/commit/7e3f48d64d237281a97b3df1a61980c78a0302fe) ([#13720](https://github.com/yt-dlp/yt-dlp/issues/13720)) by [atsushi2965](https://github.com/atsushi2965)\r\n- **xattrmetadata**: [Add macOS "Where from" attribute](https://github.com/yt-dlp/yt-dlp/commit/3e918d825d7ff367812658957b281b8cda8f9ebb) ([#12664](https://github.com/yt-dlp/yt-dlp/issues/12664)) by [rolandcrosby](https://github.com/rolandcrosby) (With fixes in [1e0c77d](https://github.com/yt-dlp/yt-dlp/commit/1e0c77ddcce335a1875ecc17d93ed6ff3fabd975) by [seproDev](https://github.com/seproDev))\r\n\r\n#### Networking changes\r\n- **Request Handler**\r\n    - curl_cffi: [Support `curl_cffi` 0.11.x, 0.12.x, 0.13.x](https://github.com/yt-dlp/yt-dlp/commit/e98695549e2eb8ce4a59abe16b5afa8adc075bbe) ([#13989](https://github.com/yt-dlp/yt-dlp/issues/13989)) by [bashonly](https://github.com/bashonly)\r\n    - requests: [Bump minimum required version of urllib3 to 2.0.2](https://github.com/yt-dlp/yt-dlp/commit/8175f3738fe4db3bc629d36bb72b927d4286d3f9) ([#13939](https://github.com/yt-dlp/yt-dlp/issues/13939)) by [bashonly](https://github.com/bashonly)\r\n\r\n#### Misc. changes\r\n- **build**: [Use `macos-14` runner for `macos` builds](https://github.com/yt-dlp/yt-dlp/commit/66aa21dc5a3b79059c38f3ad1d05dc9b29187701) ([#13814](https://github.com/yt-dlp/yt-dlp/issues/13814)) by [bashonly](https://github.com/bashonly)\r\n- **ci**: [Bump supported PyPy version to 3.11](https://github.com/yt-dlp/yt-dlp/commit/62e2a9c0d55306906f18da2927e05e1cbc31473c) ([#13877](https://github.com/yt-dlp/yt-dlp/issues/13877)) by [bashonly](https://github.com/bashonly)\r\n- **cleanup**\r\n    - [Move embed tests to dedicated extractors](https://github.com/yt-dlp/yt-dlp/commit/1c6068af997cfc0e28061fc00f4d6091e1de57da) ([#13782](https://github.com/yt-dlp/yt-dlp/issues/13782)) by [doe1080](https://github.com/doe1080)\r\n    - Miscellaneous: [5e4ceb3](https://github.com/yt-dlp/yt-dlp/commit/5e4ceb35cf997af0dbf100e1de37f4e2bcbaa0b7) by [bashonly](https://github.com/bashonly), [injust](https://github.com/injust), [seproDev](https://github.com/seproDev)\r\n\r\n</details>\r\n',
      publishedAt: "2025-08-14T17:20:21.000Z",
      isPrerelease: true,
      isDraft: false,
    },
  },
  {
    id: 70,
    githubId: "90563585",
    name: "cheat.sh",
    fullName: "chubin/cheat.sh",
    description: "the only cheat sheet you need",
    url: "https://github.com/chubin/cheat.sh",
    customTags: ["something-funny", "tools", "in-using"],
    starredAt: "2024-11-17T01:28:52.000Z",
    language: "Python",
    owner: "chubin",
    topics: [
      "cheatsheet",
      "cli",
      "command-line",
      "curl",
      "documentation",
      "examples",
      "hacktoberfest2021",
      "help",
      "terminal",
      "tldr",
    ],
    fork: false,
    forksCount: 1842,
    stargazersCount: 39845,
    watchersCount: 39845,
    defaultBranch: "master",
    isTemplate: false,
    archived: false,
    visibility: "public",
    pushedAt: "2025-08-08T05:15:06.000Z",
    githubCreatedAt: "2017-05-07T21:40:56.000Z",
    githubUpdatedAt: "2025-08-11T06:50:48.000Z",
    latestVersion: null,
    currentlyUsedVersion: null,
    updateAvailable: false,
    hasReleases: false,
    releasesLastFetched: "2025-08-04T05:42:26.026Z",
    createdAt: "2024-12-22T13:20:07.126Z",
    updatedAt: "2025-08-11T07:53:55.051Z",
    UserId: 1,
    effectiveVersion: null,
    latestRelease: null,
  },
  {
    id: 72,
    githubId: "340547520",
    name: "zed",
    fullName: "zed-industries/zed",
    description:
      "Code at the speed of thought – Zed is a high-performance, multiplayer code editor from the creators of Atom and Tree-sitter.",
    url: "https://github.com/zed-industries/zed",
    customTags: ["tools", "in-using"],
    starredAt: "2024-11-15T05:35:51.000Z",
    language: "Rust",
    owner: "zed-industries",
    topics: ["gpui", "rust-lang", "text-editor", "zed"],
    fork: false,
    forksCount: 4883,
    stargazersCount: 63657,
    watchersCount: 63657,
    defaultBranch: "main",
    isTemplate: false,
    archived: false,
    visibility: "public",
    pushedAt: "2025-08-11T07:20:04.000Z",
    githubCreatedAt: "2021-02-20T03:01:06.000Z",
    githubUpdatedAt: "2025-08-11T07:48:54.000Z",
    latestVersion: "v0.199.6",
    currentlyUsedVersion: "v0.189.5",
    updateAvailable: true,
    hasReleases: true,
    releasesLastFetched: "2025-08-16T13:08:06.658Z",
    createdAt: "2024-12-22T13:20:07.128Z",
    updatedAt: "2025-08-16T13:08:06.658Z",
    UserId: 1,
    effectiveVersion: "v0.189.5",
    latestRelease: {
      tagName: "v0.200.1-pre",
      name: "v0.200.1-pre",
      body: "- Fixed an issue where Copilot failed to sign in. ([#36138](https://github.com/zed-industries/zed/pull/36138))",
      publishedAt: "2025-08-13T22:09:35.000Z",
      isPrerelease: true,
      isDraft: false,
    },
  },
  {
    id: 404,
    githubId: "50525082",
    name: "Itsycal",
    fullName: "sfsam/Itsycal",
    description: "Itsycal is a tiny calendar for your Mac's menu bar. http://www.mowglii.com/itsycal",
    url: "https://github.com/sfsam/Itsycal",
    customTags: ["in-using", "macos", "tools", "in-changed"],
    starredAt: "2024-08-15T14:10:34.000Z",
    language: "Objective-C",
    owner: "sfsam",
    topics: [],
    fork: false,
    forksCount: 244,
    stargazersCount: 3621,
    watchersCount: 3621,
    defaultBranch: "master",
    isTemplate: false,
    archived: false,
    visibility: "public",
    pushedAt: "2025-07-30T05:21:17.000Z",
    githubCreatedAt: "2016-01-27T17:33:22.000Z",
    githubUpdatedAt: "2025-08-11T06:51:06.000Z",
    latestVersion: null,
    currentlyUsedVersion: null,
    updateAvailable: false,
    hasReleases: false,
    releasesLastFetched: "2025-08-04T05:42:27.540Z",
    createdAt: "2024-12-22T13:20:07.402Z",
    updatedAt: "2025-08-11T07:53:55.267Z",
    UserId: 1,
    effectiveVersion: null,
    latestRelease: null,
  },
]

class TagCalculator {
  static calculateTagCounts(repositories: Repository[]): TagCount[] {
    console.log("[v0] calculateTagCounts called with repositories:", repositories.length)

    const tagRepoMap = new Map<string, { repos: Set<string>; type: "language" | "topic" | "custom" }>()

    repositories.forEach((repo, index) => {
      console.log(`[v0] Processing repo ${index + 1}: ${repo.name}`)

      // Process language (single value)
      if (repo.language) {
        const lang = repo.language.toLowerCase()
        if (!tagRepoMap.has(lang)) {
          tagRepoMap.set(lang, { repos: new Set(), type: "language" })
        }
        tagRepoMap.get(lang)!.repos.add(repo.id.toString())
        console.log(`[v0] - Added language: ${lang}`)
      }

      // Process custom tags first (they take priority)
      repo.customTags.forEach((tag) => {
        const normalizedTag = tag.toLowerCase()
        if (!tagRepoMap.has(normalizedTag)) {
          tagRepoMap.set(normalizedTag, { repos: new Set(), type: "custom" })
        }
        // Always add to custom tags, even if it exists as topic
        if (tagRepoMap.get(normalizedTag)!.type !== "language") {
          tagRepoMap.get(normalizedTag)!.type = "custom"
        }
        tagRepoMap.get(normalizedTag)!.repos.add(repo.id.toString())
        console.log(`[v0] - Added custom tag: ${normalizedTag}`)
      })

      // Process topics (only if not already a custom tag)
      repo.topics.forEach((topic) => {
        const normalizedTopic = topic.toLowerCase()
        if (!tagRepoMap.has(normalizedTopic)) {
          tagRepoMap.set(normalizedTopic, { repos: new Set(), type: "topic" })
          tagRepoMap.get(normalizedTopic)!.repos.add(repo.id.toString())
          console.log(`[v0] - Added new topic: ${normalizedTopic}`)
        } else if (tagRepoMap.get(normalizedTopic)!.type === "topic") {
          // Only add to existing topics, don't override custom tags
          tagRepoMap.get(normalizedTopic)!.repos.add(repo.id.toString())
          console.log(`[v0] - Added repo to existing topic: ${normalizedTopic}`)
        } else {
          console.log(`[v0] - Skipped topic ${normalizedTopic} (exists as ${tagRepoMap.get(normalizedTopic)!.type})`)
        }
      })
    })

    // Convert to TagCount array
    const tagCounts: TagCount[] = []
    tagRepoMap.forEach((data, tag) => {
      tagCounts.push({
        tag,
        count: data.repos.size,
        type: data.type,
      })
    })

    // Sort by count descending, then by name
    tagCounts.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return a.tag.localeCompare(b.tag)
    })

    console.log("[v0] Final tag counts by type:")
    const byType = tagCounts.reduce(
      (acc, tag) => {
        acc[tag.type] = (acc[tag.type] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )
    console.log("[v0] - Languages:", byType.language || 0)
    console.log("[v0] - Topics:", byType.topic || 0)
    console.log("[v0] - Custom:", byType.custom || 0)
    console.log("[v0] - Total unique tags:", tagCounts.length)

    return tagCounts
  }
}

const calculateTagCounts = (repositories: Repository[]): TagCount[] => {
  return TagCalculator.calculateTagCounts(repositories)
}

const mockReadmeContent = `
# Trilium Notes

![GitHub Sponsors](https://img.shields.io/github/sponsors/eliandoran) ![LiberaPay patrons](https://img.shields.io/liberapay/patrons/ElianDoran)  
![Docker Pulls](https://img.shields.io/docker/pulls/triliumnext/trilium)
![GitHub Downloads (all assets, all releases)](https://img.shields.io/github/downloads/triliumnext/trilium/total)  
[![RelativeCI](https://badges.relative-ci.com/badges/Di5q7dz9daNDZ9UXi0Bp?branch=develop)](https://app.relative-ci.com/projects/Di5q7dz9daNDZ9UXi0Bp) [![Translation status](https://hosted.weblate.org/widget/trilium/svg-badge.svg)](https://hosted.weblate.org/engage/trilium/)

[English](./README.md) | [Chinese (Simplified)](./docs/README-ZH_CN.md) | [Chinese (Traditional)](./docs/README-ZH_TW.md) | [Russian](./docs/README.ru.md) | [Japanese](./docs/README.ja.md) | [Italian](./docs/README.it.md) | [Spanish](./docs/README.es.md)

Trilium Notes is a free and open-source, cross-platform hierarchical note taking application with focus on building large personal knowledge bases.

See [screenshots](https://triliumnext.github.io/Docs/Wiki/screenshot-tour) for quick overview:

<a href="https://triliumnext.github.io/Docs/Wiki/screenshot-tour"><img src="./docs/app.png" alt="Trilium Screenshot" width="1000"></a>

## 🎁 Features

* Notes can be arranged into arbitrarily deep tree. Single note can be placed into multiple places in the tree (see [cloning](https://triliumnext.github.io/Docs/Wiki/cloning-notes))
* Rich WYSIWYG note editor including e.g. tables, images and [math](https://triliumnext.github.io/Docs/Wiki/text-notes) with markdown [autoformat](https://triliumnext.github.io/Docs/Wiki/text-notes#autoformat)
* Support for editing [notes with source code](https://triliumnext.github.io/Docs/Wiki/code-notes), including syntax highlighting
* Fast and easy [navigation between notes](https://triliumnext.github.io/Docs/Wiki/note-navigation), full text search and [note hoisting](https://triliumnext.github.io/Docs/Wiki/note-hoisting)
* Seamless [note versioning](https://triliumnext.github.io/Docs/Wiki/note-revisions)
* Note [attributes](https://triliumnext.github.io/Docs/Wiki/attributes) can be used for note organization, querying and advanced [scripting](https://triliumnext.github.io/Docs/Wiki/scripts)
* UI available in English, German, Spanish, French, Romanian, and Chinese (simplified and traditional)
* Direct [OpenID and TOTP integration](./docs/User%20Guide/User%20Guide/Installation%20%26%20Setup/Server%20Installation/Multi-Factor%20Authentication.md) for more secure login
* [Synchronization](https://triliumnext.github.io/Docs/Wiki/synchronization) with self-hosted sync server
  * there's a [3rd party service for hosting synchronisation server](https://trilium.cc/paid-hosting)
* [Sharing](https://triliumnext.github.io/Docs/Wiki/sharing) notes to public internet
* Strong [note encryption](https://triliumnext.github.io/Docs/Wiki/protected-notes) with per-note granularity
* Sketching diagrams, based on [Excalidraw](https://excalidraw.com/) (note type "canvas")
* [Relation maps](https://triliumnext.github.io/Docs/Wiki/relation-map) and [link maps](https://triliumnext.github.io/Docs/Wiki/link-map) for visualizing notes and their relations
* Mind maps, based on [Mind Elixir](https://docs.mind-elixir.com/)
* [Geo maps](./docs/User%20Guide/User%20Guide/Note%20Types/Geo%20Map.md) with location pins and GPX tracks
* [Scripting](https://triliumnext.github.io/Docs/Wiki/scripts) - see [Advanced showcases](https://triliumnext.github.io/Docs/Wiki/advanced-showcases)
* [REST API](https://triliumnext.github.io/Docs/Wiki/etapi) for automation
* Scales well in both usability and performance upwards of 100 000 notes
* Touch optimized [mobile frontend](https://triliumnext.github.io/Docs/Wiki/mobile-frontend) for smartphones and tablets
* Built-in [dark theme](https://triliumnext.github.io/Docs/Wiki/themes), support for user themes
* [Evernote](https://triliumnext.github.io/Docs/Wiki/evernote-import) and [Markdown import & export](https://triliumnext.github.io/Docs/Wiki/markdown)
* [Web Clipper](https://triliumnext.github.io/Docs/Wiki/web-clipper) for easy saving of web content
* Customizable UI (sidebar buttons, user-defined widgets, ...)
* [Metrics](./docs/User%20Guide/User%20Guide/Advanced%20Usage/Metrics.md), along with a [Grafana Dashboard](./docs/User%20Guide/User%20Guide/Advanced%20Usage/Metrics/grafana-dashboard.json)

✨ Check out the following third-party resources/communities for more TriliumNext related goodies:

- [awesome-trilium](https://github.com/Nriver/awesome-trilium) for 3rd party themes, scripts, plugins and more.
- [TriliumRocks!](https://trilium.rocks/) for tutorials, guides, and much more.

## ❓Why TriliumNext?

The original Trilium developer ([Zadam](https://github.com/zadam)) has graciously given the Trilium repository to the community project which resides at https://github.com/TriliumNext

### ⬆️Migrating from Zadam/Trilium?

There are no special migration steps to migrate from a zadam/Trilium instance to a TriliumNext/Trilium instance. Simply [install TriliumNext/Trilium](#-installation) as usual and it will use your existing database.

Versions up to and including [v0.90.4](https://github.com/TriliumNext/Trilium/releases/tag/v0.90.4) are compatible with the latest zadam/trilium version of [v0.63.7](https://github.com/zadam/trilium/releases/tag/v0.63.7). Any later versions of TriliumNext/Trilium have their sync versions incremented which prevents direct migration.

## 📖 Documentation

We're currently in the progress of moving the documentation to in-app (hit the \`F1\` key within Trilium). As a result, there may be some missing parts until we've completed the migration. If you'd prefer to navigate through the documentation within GitHub, you can navigate the [User Guide](./docs/User%20Guide/User%20Guide/) documentation. 

Below are some quick links for your convenience to navigate the documentation:
- [Server installation](./docs/User%20Guide/User%20Guide/Installation%20%26%20Setup/Server%20Installation.md)
  - [Docker installation](./docs/User%20Guide/User%20Guide/Installation%20%26%20Setup/Server%20Installation/1.%20Installing%20the%20server/Using%20Docker.md)
- [Upgrading TriliumNext](./docs/User%20Guide/User%20Guide/Installation%20%26%20Setup/Upgrading%20TriliumNext.md)
- [Concepts and Features - Note](./docs/User%20Guide/User%20Guide/Basic%20Concepts%20and%20Features/Notes.md)
- [Patterns of personal knowledge base](https://triliumnext.github.io/Docs/Wiki/patterns-of-personal-knowledge)

Until we finish reorganizing the documentation, you may also want to [browse the old documentation](https://triliumnext.github.io/Docs).

## 💬 Discuss with us

Feel free to join our official conversations. We would love to hear what features, suggestions, or issues you may have!

- [Matrix](https://matrix.to/#/#triliumnext:matrix.org) (For synchronous discussions.)
  - The \`General\` Matrix room is also bridged to [XMPP](xmpp:discuss@trilium.thisgreat.party?join)
- [Github Discussions](https://github.com/TriliumNext/Trilium/discussions) (For asynchronous discussions.)
- [Github Issues](https://github.com/TriliumNext/Trilium/issues) (For bug reports and feature requests.)

## 🏗 Installation

### Windows / MacOS

Download the binary release for your platform from the [latest release page](https://github.com/TriliumNext/Trilium/releases/latest), unzip the package and run the \`trilium\` executable.

### Linux

If your distribution is listed in the table below, use your distribution's package.

[![Packaging status](https://repology.org/badge/vertical-allrepos/triliumnext.svg)](https://repology.org/project/triliumnext/versions)

You may also download the binary release for your platform from the [latest release page](https://github.com/TriliumNext/Trilium/releases/latest), unzip the package and run the \`trilium\` executable.

TriliumNext is also provided as a Flatpak, but not yet published on FlatHub.

### Browser (any OS)

If you use a server installation (see below), you can directly access the web interface (which is almost identical to the desktop app).

Currently only the latest versions of Chrome & Firefox are supported (and tested).

### Mobile

To use TriliumNext on a mobile device, you can use a mobile web browser to access the mobile interface of a server installation (see below).

See issue https://github.com/TriliumNext/Trilium/issues/4962 for more information on mobile app support.

If you prefer a native Android app, you can use [TriliumDroid](https://apt.izzysoft.de/fdroid/index/apk/eu.fliegendewurst.triliumdroid).
Report bugs and missing features at [their repository](https://github.com/FliegendeWurst/TriliumDroid).
Note: It is best to disable automatic updates on your server installation (see below) when using TriliumDroid since the sync version must match between Trilium and TriliumDroid.

### Server

To install TriliumNext on your own server (including via Docker from [Dockerhub](https://hub.docker.com/r/triliumnext/trilium)) follow [the server installation docs](https://triliumnext.github.io/Docs/Wiki/server-installation).


## 💻 Contribute

### Translations

If you are a native speaker, help us translate Trilium by heading over to our [Weblate page](https://hosted.weblate.org/engage/trilium/).

Here's the language coverage we have so far:

[![Translation status](https://hosted.weblate.org/widget/trilium/multi-auto.svg)](https://hosted.weblate.org/engage/trilium/)

### Code

Download the repository, install dependencies using \`pnpm\` and then run the server (available at http://localhost:8080):
\`\`\`shell
git clone https://github.com/TriliumNext/Trilium.git
cd Trilium
pnpm install
pnpm run server:start
\`\`\`

### Documentation

Download the repository, install dependencies using \`pnpm\` and then run the environment required to edit the documentation:
\`\`\`shell
git clone https://github.com/TriliumNext/Trilium.git
cd Trilium
pnpm install
pnpm nx run edit-docs:edit-docs
\`\`\`

### Building the Executable
Download the repository, install dependencies using \`pnpm\` and then build the desktop app for Windows:
\`\`\`shell
git clone https://github.com/TriliumNext/Trilium.git
cd Trilium
pnpm install
pnpm nx --project=desktop electron-forge:make -- --arch=x64 --platform=win32
\`\`\`

For more details, see the [development docs](https://github.com/TriliumNext/Trilium/tree/main/docs/Developer%20Guide/Developer%20Guide).

### Developer Documentation

Please view the [documentation guide](https://github.com/TriliumNext/Trilium/blob/main/docs/Developer%20Guide/Developer%20Guide/Environment%20Setup.md) for details. If you have more questions, feel free to reach out via the links described in the "Discuss with us" section above.

## 👏 Shoutouts

* [CKEditor 5](https://github.com/ckeditor/ckeditor5) - best WYSIWYG editor on the market, very interactive and listening team
* [FancyTree](https://github.com/mar10/fancytree) - very feature rich tree library without real competition. Trilium Notes would not be the same without it.
* [CodeMirror](https://github.com/codemirror/CodeMirror) - code editor with support for huge amount of languages
* [jsPlumb](https://github.com/jsplumb/jsplumb) - visual connectivity library without competition. Used in [relation maps](https://triliumnext.github.io/Docs/Wiki/relation-map.html) and [link maps](https://triliumnext.github.io/Docs/Wiki/note-map.html#link-map)

## 🤝 Support

Support for the TriliumNext organization will be possible in the near future. For now, you can:
- Support continued development on TriliumNext by supporting our developers: [eliandoran](https://github.com/sponsors/eliandoran) (See the [repository insights]([developers]([url](https://github.com/TriliumNext/trilium/graphs/contributors))) for a full list)
- Show a token of gratitude to the original Trilium developer ([zadam](https://github.com/sponsors/zadam)) via [PayPal](https://paypal.me/za4am) or Bitcoin (bitcoin:bc1qv3svjn40v89mnkre5vyvs2xw6y8phaltl385d2).


## 🔑 License

Copyright 2017-2025 zadam, Elian Doran, and other contributors

This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

`

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"starredAt" | "stargazersCount" | "name">("starredAt")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [readmeContent, setReadmeContent] = useState<string>("")
  const [isLoadingReadme, setIsLoadingReadme] = useState(false)
  const [editingTags, setEditingTags] = useState<{ [key: number]: boolean }>({})
  const [newTagInputs, setNewTagInputs] = useState<{ [key: number]: string }>({})
  const [updatingTags, setUpdatingTags] = useState<{ [key: number]: boolean }>({})
  const [tagErrors, setTagErrors] = useState<{ [key: number]: string }>({})
  const [batchTagInput, setBatchTagInput] = useState("")
  const [isBatchTagging, setIsBatchTagging] = useState(false)
  const [batchTagProgress, setBatchTagProgress] = useState({ current: 0, total: 0 })
  const [batchTagError, setBatchTagError] = useState("")
  const [activeAdvancedFilters, setActiveAdvancedFilters] = useState<AdvancedFilter[]>([])
  const [lastFetchTime, setLastFetchTime] = useState<number>(0)
  const [cacheKey, setCacheKey] = useState<string>("")
  const router = useRouter()

  const handleRemoveTag = async (repoId: number, tag: string) => {
    setUpdatingTags((prev) => ({ ...prev, [repoId]: true }))
    try {
      const response = await fetch(`/api/repos/${repoId}/tags`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tag }),
          credentials: "include",
        })

        if (response.ok) {
          setRepositories((prev) =>
            prev.map((repo) =>
              repo.id === repoId ? { ...repo, customTags: repo.customTags.filter((t) => t !== tag) } : repo,
            ),
          )
      }
    } catch (error) {
      console.error("Failed to remove tag:", error)
    } finally {
      setUpdatingTags((prev) => ({ ...prev, [repoId]: false }))
    }
  }

  const validateTag = (tag: string): { isValid: boolean; error?: string } => {
    const trimmed = tag.trim()
    if (!trimmed) return { isValid: false, error: "Tag cannot be empty" }
    if (trimmed.length > 50) return { isValid: false, error: "Tag must be 50 characters or less" }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return { isValid: false, error: "Tag can only contain letters, numbers, dots, hyphens, and underscores" }
    return { isValid: true }
  }

  const handleAddTag = async (repoId: number, tag: string) => {
    const validation = validateTag(tag)
    if (!validation.isValid) {
      setTagErrors((prev) => ({ ...prev, [repoId]: validation.error! }))
      setTimeout(() => setTagErrors((prev) => ({ ...prev, [repoId]: "" })), 3000)
      return
    }

    const trimmedTag = tag.trim()
    // Check if tag already exists
    const repo = repositories.find(r => r.id === repoId)
    if (repo?.customTags.includes(trimmedTag)) {
      setTagErrors((prev) => ({ ...prev, [repoId]: "Tag already exists for this repository" }))
      setTimeout(() => setTagErrors((prev) => ({ ...prev, [repoId]: "" })), 3000)
      return
    }

    // Clear any existing error
    setTagErrors((prev) => ({ ...prev, [repoId]: "" }))

    setUpdatingTags((prev) => ({ ...prev, [repoId]: true }))
    try {
      const response = await fetch(`/api/repos/${repoId}/tags`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tag: tag.trim() }),
          credentials: "include",
        })

        if (response.ok) {
          setRepositories((prev) =>
            prev.map((repo) => (repo.id === repoId ? { ...repo, customTags: [...repo.customTags, tag.trim()] } : repo)),
          )
        }
      } catch (error) {
        console.error("Failed to add tag:", error)
        // Optimistically update UI even on error
        setRepositories((prev) =>
          prev.map((repo) => (repo.id === repoId ? { ...repo, customTags: [...repo.customTags, tag.trim()] } : repo)),
        )
      } finally {
        setNewTagInputs((prev) => ({ ...prev, [repoId]: "" }))
        setEditingTags((prev) => ({ ...prev, [repoId]: false }))
        setUpdatingTags((prev) => ({ ...prev, [repoId]: false }))
      }
  }

  const toggleTagEditing = (repoId: number) => {
    setEditingTags((prev) => ({ ...prev, [repoId]: !prev[repoId] }))
    if (!editingTags[repoId]) {
      setNewTagInputs((prev) => ({ ...prev, [repoId]: "" }))
    }
  }

  const handleRefreshReadme = () => {
    if (selectedRepo) {
      handleRepoClick(selectedRepo)
    }
  }

  const handleVersionUpdate = (repoId: number, version: string | null) => {
    setRepositories((prev) =>
      prev.map((repo) => {
        if (repo.id === repoId) {
          const updateAvailable = version && repo.latestVersion && version !== repo.latestVersion
          return {
            ...repo,
            currentlyUsedVersion: version || "",
            updateAvailable: !!updateAvailable,
          }
        }
        return repo
      }),
    )
  }

  const handleLogout = async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      })
      router.push("/")
    } catch (error) {
      console.error("Logout failed:", error)
      router.push("/")
    }
  }

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleClearFilters = () => {
    setSelectedTags([])
    setActiveAdvancedFilters([])
  }

  const evaluateAdvancedFilter = useCallback((repo: Repository, expression: string): boolean => {
    if (!expression.trim()) return true

    try {
      let expr = expression.toLowerCase()

      const allTags = [
        ...repo.customTags.map((t) => t.toLowerCase()),
        ...repo.topics.map((t) => t.toLowerCase()),
        ...(repo.language ? [repo.language.toLowerCase()] : []),
      ]

      const tagMatches = expr.match(/\b[a-z0-9-_]+\b/g) || []
      const uniqueTags = [...new Set(tagMatches.filter((tag) => !["and", "or", "not"].includes(tag)))]

      uniqueTags.forEach((tag) => {
        const hasTag = allTags.includes(tag)
        expr = expr.replace(new RegExp(`\\b${tag}\\b`, "g"), hasTag.toString())
      })

      expr = expr.replace(/\band\b/g, "&&")
      expr = expr.replace(/\bor\b/g, "||")
      expr = expr.replace(/\bnot\b/g, "!")

      return Function(`"use strict"; return (${expr})`)()
    } catch (error) {
      console.warn("Invalid filter expression:", expression)
      return true
    }
  }, [])

  const getFilteredRepositories = useCallback((repos: Repository[]) => {
    let filtered = [...repos]

    // Apply search query first
    if (searchQuery) {
      filtered = filtered.filter((repo) => {
        const matchesSearch =
          repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          repo.owner.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesSearch
      })
    }

    // Apply tag filters (AND relationship between selected tags)
    if (selectedTags.length > 0) {
      filtered = filtered.filter((repo) =>
        selectedTags.every(
          (tag) =>
            repo.customTags.some((t) => t.toLowerCase() === tag.toLowerCase()) ||
            repo.topics.some((t) => t.toLowerCase() === tag.toLowerCase()) ||
            (repo.language && repo.language.toLowerCase() === tag.toLowerCase()),
        ),
      )
    }

    // Apply all advanced filters (AND relationship)
    activeAdvancedFilters.forEach((filter) => {
      filtered = filtered.filter((repo) => evaluateAdvancedFilter(repo, filter.expression))
    })

    filtered.sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case "starredAt":
          aVal = new Date(a.starredAt).getTime()
          bVal = new Date(b.starredAt).getTime()
          break
        case "stargazersCount":
          aVal = a.stargazersCount
          bVal = b.stargazersCount
          break
        case "name":
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        default:
          return 0
      }

      if (sortOrder === "desc") {
        return bVal > aVal ? 1 : -1
      } else {
        return aVal > bVal ? 1 : -1
      }
    })

    return filtered
  }, [searchQuery, selectedTags, activeAdvancedFilters, evaluateAdvancedFilter, sortBy, sortOrder])

  const handleAddAdvancedFilter = (expression: string) => {
    if (expression.trim()) {
      const newFilter: AdvancedFilter = {
        id: Date.now().toString(),
        expression: expression.trim(),
      }
      setActiveAdvancedFilters((prev) => [...prev, newFilter])
    }
  }

  const handleRemoveAdvancedFilter = (filterId: string) => {
    setActiveAdvancedFilters((prev) => prev.filter((f) => f.id !== filterId))
  }

  const handleBatchAddTag = async () => {
    const trimmedTag = batchTagInput.trim()
    
    const validation = validateTag(trimmedTag)
    if (!validation.isValid) {
      setBatchTagError(validation.error!)
      setTimeout(() => setBatchTagError(""), 3000)
      return
    }

    setBatchTagError("")
    const currentFilteredRepos = getFilteredRepositories(repositories)
    const reposToUpdate = currentFilteredRepos.filter(repo => !repo.customTags.includes(trimmedTag))
    
    if (reposToUpdate.length === 0) {
      setBatchTagError("All filtered repositories already have this tag")
      setTimeout(() => setBatchTagError(""), 3000)
      return
    }

    setIsBatchTagging(true)
    setBatchTagProgress({ current: 0, total: reposToUpdate.length })

    let successCount = 0
    for (let i = 0; i < reposToUpdate.length; i++) {
      const repo = reposToUpdate[i]
      
      try {
        const response = await fetch(`/api/repos/${repo.id}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: trimmedTag }),
          credentials: "include",
        })

        if (response.ok) {
          setRepositories((prev) =>
            prev.map((r) => (r.id === repo.id ? { ...r, customTags: [...r.customTags, trimmedTag] } : r)),
          )
          successCount++
        }
      } catch (error) {
        console.error(`Failed to add tag to repo ${repo.id}:`, error)
        setRepositories((prev) =>
          prev.map((r) => (r.id === repo.id ? { ...r, customTags: [...r.customTags, trimmedTag] } : r)),
        )
        successCount++
      }

      setBatchTagProgress({ current: i + 1, total: reposToUpdate.length })
      if (i < reposToUpdate.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    setIsBatchTagging(false)
    setBatchTagInput("")
    setBatchTagProgress({ current: 0, total: 0 })
    setBatchTagError(`Successfully added tag to ${successCount} repositories`)
    setTimeout(() => setBatchTagError(""), 4000)
  }

  const filteredRepositories = getFilteredRepositories(repositories)

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const userResponse = await fetch("/auth/user", {
          credentials: "include",
        })

        if (!userResponse.ok) {
          console.log("[v0] Using mock data for preview environment")
          setUser(mockUser)
          setRepositories(mockRepositories)
          setIsLoading(false)
          return
        }

        const userData = await userResponse.json()
        setUser(userData)

        await Promise.all([loadRepositories()])
      } catch (error) {
        console.error("Failed to initialize app:", error)
        console.log("[v0] API unavailable, using mock data")
        setUser(mockUser)
        setRepositories(mockRepositories)
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()
  }, [router])

  const loadRepositories = useCallback(async (forceRefresh = false) => {
    // Create cache key from current params
    const currentCacheKey = `${sortBy}-${sortOrder}`
    const now = Date.now()
    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
    
    // Check if we can use cached data (only for non-tag filter changes)
    if (!forceRefresh && 
        cacheKey === currentCacheKey && 
        repositories.length > 0 && 
        (now - lastFetchTime) < CACHE_DURATION) {
      console.log("[Cache] Using cached repositories data")
      return
    }

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      }

      const params = new URLSearchParams({
        sort: sortBy,
        order: sortOrder,
      })

      const response = await fetch(`/api/repos?${params}`, {
        credentials: "include",
        headers,
      })

      if (response.ok) {
        const data = await response.json()
        const repos = data.repos || data
        setRepositories(repos)
        setLastFetchTime(now)
        setCacheKey(currentCacheKey)
        console.log("[API] Loaded fresh repositories data:", repos.length, "repos")
      } else {
        console.log("[v0] API unavailable, using mock data")
        setRepositories(mockRepositories)
      }
    } catch (error) {
      console.error("Failed to load repositories:", error)
      setRepositories(mockRepositories)
    }
  }, [sortBy, sortOrder, cacheKey, repositories.length, lastFetchTime])

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        await loadRepositories(true) // Force refresh after sync
      } else {
        console.log("[v0] Simulating sync with mock data")
        await new Promise((resolve) => setTimeout(resolve, 1000))
        setRepositories(mockRepositories)
      }
    } catch (error) {
      console.error("Sync failed:", error)
      setRepositories(mockRepositories)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleRepoClick = async (repo: Repository) => {
    console.log("[v0] handleRepoClick called with repo:", repo.name)
    setSelectedRepo(repo)
    console.log("[v0] selectedRepo state updated, should open modal")
    setIsLoadingReadme(true)
    setReadmeContent("")

    try {
        const response = await fetch(`/api/repos/${repo.fullName}/readme`, {
          headers: {},
          credentials: "include",
        })

        if (response.ok) {
          // GitHub raw README returns plain text/markdown, not JSON
          const text = await response.text()
          setReadmeContent(text)
        } else {
          console.log("[v0] Using mock README content")
          setReadmeContent(mockReadmeContent)
        }
    } catch (error) {
      console.error("Failed to load README:", error)
      setReadmeContent(mockReadmeContent)
    } finally {
      setIsLoadingReadme(false)
    }
  }

  useEffect(() => {
      // Only load if sorting/ordering changes, tags are applied via client-side filtering
      if (sortBy !== "starredAt" || sortOrder !== "desc") {
        loadRepositories()
      }
  }, [sortBy, sortOrder, loadRepositories])

  useEffect(() => {
    ;(window as any).TagCalculator = TagCalculator
  }, [])

  const displayedRepositories = getFilteredRepositories(repositories)
  useEffect(() => {
    // Debug render sizes
    console.log("[v0] Render - repositories.length:", repositories.length, "displayedRepositories.length:", displayedRepositories.length)
  }, [repositories, displayedRepositories])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-gray-200 bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Star className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">GitHub Star Manager</h1>
            </div>
            <Button onClick={handleSync} disabled={isSyncing} variant="outline" size="sm" className="border-gray-200 text-gray-600 hover:bg-gray-50">
              <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing..." : "Sync"}
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user && (
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={user.avatarUrl || "/placeholder.svg"} alt={user.username} />
                  <AvatarFallback>{user.username[0]?.toUpperCase()}</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium">{user.username}</span>
              </div>
            )}
            <Button onClick={handleLogout} variant="ghost" size="sm">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>


      <div className="flex h-[calc(100vh-73px)] min-w-0">
        <TagFilterPanel
          key={`repos-${repositories.length}-${selectedTags.join(',')}-${activeAdvancedFilters.map(f => f.expression).join(',')}`}
          repositories={filteredRepositories}
          allRepositories={repositories}
          selectedTags={selectedTags}
          onTagToggle={handleTagToggle}
          onClearFilters={handleClearFilters}
          activeAdvancedFilters={activeAdvancedFilters}
          onAddAdvancedFilter={handleAddAdvancedFilter}
          onRemoveAdvancedFilter={handleRemoveAdvancedFilter}
        />

        <div className="flex-1 min-w-0 flex flex-col">
        <div className="border-b border-gray-200 p-4 bg-card shrink-0">
            <div className="flex items-center gap-4 min-w-0">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search repositories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-gray-200"
                />
              </div>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split("-")
                  setSortBy(field as typeof sortBy)
                  setSortOrder(order as typeof sortOrder)
                }}
                className="px-3 py-2 border border-gray-200 rounded-md bg-background text-sm text-gray-600"
              >
                <option value="starredAt-desc">Recently Starred</option>
                <option value="starredAt-asc">Oldest Starred</option>
                <option value="stargazersCount-desc">Most Stars</option>
                <option value="stargazersCount-asc">Least Stars</option>
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
              </select>

              {/* Batch Add Tags */}
              {filteredRepositories.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Input
                      placeholder={`Add tag to ${filteredRepositories.length} repos...`}
                      value={batchTagInput}
                      onChange={(e) => {
                        setBatchTagInput(e.target.value)
                        // Clear error when user starts typing
                        if (batchTagError) {
                          setBatchTagError("")
                        }
                      }}
                      className="w-48 h-9 text-sm border-gray-200"
                      disabled={isBatchTagging}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isBatchTagging && batchTagInput.trim()) {
                          handleBatchAddTag()
                        }
                      }}
                    />
                    {batchTagError && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded text-xs shadow-sm z-20">
                        {batchTagError}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={handleBatchAddTag}
                    disabled={!batchTagInput.trim() || isBatchTagging}
                    className="h-9 px-3 text-sm bg-blue-600 hover:bg-blue-700 border-blue-600 text-white shadow-sm"
                  >
                    {isBatchTagging ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-b border-white mr-1"></div>
                        {batchTagProgress.current}/{batchTagProgress.total}
                      </>
                    ) : (
                      <>
                        <Plus className="h-3 w-3 mr-1" />
                        Add to All
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Repository Grid */}
          <div className="flex-1 min-w-0 overflow-y-auto">
            {isLoading || isSyncing ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-4 w-64">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  <p className="text-sm text-muted-foreground">
                    {isLoading ? "Loading repositories..." : "Syncing with GitHub..."}
                  </p>
                  {(isLoading || isSyncing) && loadingProgress > 0 && (
                    <div className="w-full">
                      <Progress value={loadingProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground mt-1 text-center">
                        {loadingProgress}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <RepositoryGrid 
                repositories={filteredRepositories} 
                handleRepoClick={handleRepoClick}
                handleTagToggle={handleTagToggle}
                handleRemoveTag={handleRemoveTag}
                handleAddTag={handleAddTag}
                tagErrors={tagErrors}
                setTagErrors={setTagErrors}
              />
            )}
          </div>
        </div>
      </div>

      <RepositoryDetailsModal
        repository={selectedRepo}
        isOpen={!!selectedRepo}
        onClose={() => {
          console.log("[v0] Modal closing, clearing selectedRepo")
          setSelectedRepo(null)
        }}
        readmeContent={readmeContent}
        isLoadingReadme={isLoadingReadme}
        onRefreshReadme={handleRefreshReadme}
        onVersionUpdate={handleVersionUpdate}
        onRemoveTag={handleRemoveTag}
        onAddTag={handleAddTag}
      />
    </div>
  )
}

interface RepositoryGridProps {
  repositories: Repository[]
  handleRepoClick: (repo: Repository) => void
  handleTagToggle: (tag: string) => void
  handleRemoveTag: (repoId: number, tag: string) => Promise<void>
  handleAddTag: (repoId: number, tag: string) => Promise<void>
  tagErrors: { [key: number]: string }
  setTagErrors: React.Dispatch<React.SetStateAction<{ [key: number]: string }>>
}

const RepositoryGrid: React.FC<RepositoryGridProps> = ({ repositories, handleRepoClick, handleTagToggle, handleRemoveTag, handleAddTag, tagErrors, setTagErrors }) => {
  const [editingTags, setEditingTags] = useState<{ [key: number]: boolean }>({})
  const [newTagInputs, setNewTagInputs] = useState<{ [key: number]: string }>({})
  const [updatingTags, setUpdatingTags] = useState<{ [key: number]: boolean }>({})
  
  
  const toggleTagEditing = (repoId: number) => {
    setEditingTags((prev) => ({ ...prev, [repoId]: !prev[repoId] }))
    if (!editingTags[repoId]) {
      setNewTagInputs((prev) => ({ ...prev, [repoId]: "" }))
    }
  }
  // const { handleRepoClick } = useRepositoryDetails()

    return (
    <div className="w-full">
      <div
        className="p-4"
        style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px',
          alignItems: 'start'
        }}
      >
        {repositories.map((repo) => (
          <Card
            key={repo.id}
            className="transition-all hover:shadow-lg hover:scale-[1.005] cursor-pointer shadow-sm border-gray-200"
            onClick={(e) => {
              if (
                (e.target as HTMLElement).closest(".tag-management") ||
                (e.target as HTMLElement).closest(".tag-filter")
              ) {
                e.stopPropagation()
                return
              }
              handleRepoClick(repo)
            }}
          >
            <CardContent className="p-4 py-0">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <a
                      href={repo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-base text-primary hover:underline transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {repo.fullName}
                    </a>
                    {repo.description && (
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{repo.description}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(repo.starredAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                    {repo.updateAvailable && (
                      <div className="flex items-center gap-1 text-xs text-orange-600">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        <span>Update</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {repo.topics
                      .filter((topic) => !repo.customTags.includes(topic))
                      .map((topic) => (
                        <Badge
                          key={`topic-${topic}`}
                          variant="secondary"
                          className="text-xs px-2 py-1 cursor-pointer hover:bg-green-200 transition-colors bg-green-50 text-green-700 border-gray-200 tag-filter"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleTagToggle(topic)
                          }}
                          title="Click to filter by this topic"
                        >
                          {topic}
                        </Badge>
                      ))}

                    {repo.customTags.map((tag) => (
                      <Badge
                        key={`custom-${tag}`}
                        variant="default"
                        className="text-xs px-2 py-1 cursor-pointer hover:bg-blue-200 transition-colors bg-blue-50 text-blue-700 border-gray-200 tag-filter flex items-center gap-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleTagToggle(tag)
                        }}
                        title="Click to filter by this tag"
                      >
                        {tag}
                        <button
                          className="ml-1 hover:bg-destructive/20 hover:text-destructive rounded-full p-0.5 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveTag(repo.id, tag)
                          }}
                          title="Remove custom tag"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>

                  <div className="tag-management">
                    {editingTags[repo.id] ? (
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Input
                            value={newTagInputs[repo.id] || ""}
                            onChange={(e) => {
                              setNewTagInputs((prev) => ({ ...prev, [repo.id]: e.target.value }))
                              // Clear error when user starts typing
                              if (tagErrors[repo.id]) {
                                setTagErrors((prev) => ({ ...prev, [repo.id]: "" }))
                              }
                            }}
                            placeholder="Add custom tag..."
                            className="h-7 text-xs"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (newTagInputs[repo.id]?.trim()) {
                              handleAddTag(repo.id, newTagInputs[repo.id].trim())
                              setNewTagInputs((prev) => ({ ...prev, [repo.id]: "" }))
                              toggleTagEditing(repo.id)
                            }
                              } else if (e.key === "Escape") {
                                toggleTagEditing(repo.id)
                              }
                            }}
                            autoFocus
                          />
                          {newTagInputs[repo.id] && (
                            <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-32 overflow-y-auto">
                              {(() => {
                                // Calculate global tag counts
                                const globalTagCounts = new Map<string, number>()
                                repositories.forEach((r) => {
                                  r.customTags.forEach((tag) => {
                                    globalTagCounts.set(tag, (globalTagCounts.get(tag) || 0) + 1)
                                  })
                                  r.topics.forEach((topic) => {
                                    globalTagCounts.set(topic, (globalTagCounts.get(topic) || 0) + 1)
                                  })
                                  if (r.language) {
                                    globalTagCounts.set(r.language, (globalTagCounts.get(r.language) || 0) + 1)
                                  }
                                })

                                return Array.from(new Set(repositories.flatMap((r) => [...r.customTags, ...r.topics, r.language].filter(Boolean))))
                                  .filter((tag) => {
                                    const input = (newTagInputs[repo.id] || "").toLowerCase().trim()
                                    const tagLower = tag.toLowerCase()
                                    return (
                                      input &&
                                      tagLower.includes(input) &&
                                      !repo.customTags.includes(tag) &&
                                      tag !== (newTagInputs[repo.id] || "").trim()
                                    )
                                  })
                                  .sort((a, b) => {
                                    // Sort by global count descending, then by relevance
                                    const countA = globalTagCounts.get(a) || 0
                                    const countB = globalTagCounts.get(b) || 0
                                    if (countB !== countA) return countB - countA
                                    
                                    // Secondary sort by relevance (starts with input)
                                    const input = (newTagInputs[repo.id] || "").toLowerCase().trim()
                                    const aStarts = a.toLowerCase().startsWith(input)
                                    const bStarts = b.toLowerCase().startsWith(input)
                                    if (aStarts && !bStarts) return -1
                                    if (!aStarts && bStarts) return 1
                                    return a.localeCompare(b)
                                  })
                                  .slice(0, 8)
                                  .map((suggestion) => {
                                    const input = (newTagInputs[repo.id] || "").toLowerCase().trim()
                                    const parts = suggestion.split(new RegExp(`(${input})`, "gi"))
                                    const globalCount = globalTagCounts.get(suggestion) || 0

                                    return (
                                      <button
                                        key={suggestion}
                                        className="w-full text-left px-2 py-1 text-xs hover:bg-gray-100 transition-colors flex items-center justify-between"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleAddTag(repo.id, suggestion)
                                          setNewTagInputs((prev) => ({ ...prev, [repo.id]: "" }))
                                          toggleTagEditing(repo.id)
                                        }}
                                      >
                                        <span>
                                          {parts.map((part, index) =>
                                            part.toLowerCase() === input ? (
                                              <span key={index} className="bg-blue-200 text-blue-800 font-medium">
                                                {part}
                                              </span>
                                            ) : (
                                              <span key={index}>{part}</span>
                                            ),
                                          )}
                                        </span>
                                        <span className="text-gray-400 text-xs ml-2">({globalCount})</span>
                                      </button>
                                    )
                                  })
                              })()}
                            </div>
                          )}
                          {tagErrors[repo.id] && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-red-50 border border-red-200 text-red-700 px-2 py-1 rounded text-xs shadow-sm z-20">
                              {tagErrors[repo.id]}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          className="h-7 px-2 text-xs bg-green-50 text-green-600 border-gray-200 hover:bg-green-100"
                          onClick={() => {
                            if (newTagInputs[repo.id]?.trim()) {
                              handleAddTag(repo.id, newTagInputs[repo.id].trim())
                              setNewTagInputs((prev) => ({ ...prev, [repo.id]: "" }))
                              toggleTagEditing(repo.id)
                            }
                          }}
                          disabled={updatingTags[repo.id] || !newTagInputs[repo.id]?.trim()}
                        >
                          Add
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 bg-transparent"
                          onClick={() => toggleTagEditing(repo.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0 rounded-full bg-blue-50 text-blue-600 border-gray-200 hover:bg-blue-100"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleTagEditing(repo.id)
                        }}
                        title="Add custom tag"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-200 relative">
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3" />
                      {repo.stargazersCount > 1000
                        ? `${(repo.stargazersCount / 1000).toFixed(1)}k`
                        : repo.stargazersCount.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1">
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M7.707 3.293a1 1 0 010 1.414L5.414 7H11a7 7 0 017 7v2a1 1 0 11-2 0v-2a5 5 0 00-5-5H5.414l2.293 2.293a1 1 0 11-1.414 1.414L2.586 7l3.707-3.707a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {repo.forksCount > 1000
                        ? `${(repo.forksCount / 1000).toFixed(1)}k`
                        : repo.forksCount.toLocaleString()}
                    </div>
                    {repo.hasReleases && repo.currentlyUsedVersion && (
                      <Badge variant="outline" className="text-xs border-gray-200 text-gray-600">
                        v{repo.currentlyUsedVersion}
                      </Badge>
                    )}
                  </div>

                  {repo.language && (
                    <Badge variant="secondary" className="text-xs px-2 py-1 bg-gray-100 text-gray-700 border-gray-200">
                      {repo.language}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}


const useRepositoryDetails = () => {
  const { handleRepoClick } = useDashboard()
  return {
    handleRepoClick, // Use the main component's handleRepoClick function
  }
}

function useDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"starredAt" | "stargazersCount" | "name">("starredAt")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null)
  const [readmeContent, setReadmeContent] = useState<string>("")
  const [isLoadingReadme, setIsLoadingReadme] = useState(false)
  const [editingTags, setEditingTags] = useState<{ [key: number]: boolean }>({})
  const [newTagInputs, setNewTagInputs] = useState<{ [key: number]: string }>({})
  const [updatingTags, setUpdatingTags] = useState<{ [key: number]: boolean }>({})
  const [activeAdvancedFilters, setActiveAdvancedFilters] = useState<AdvancedFilter[]>([])
  const [lastFetchTime, setLastFetchTime] = useState<number>(0)
  const [cacheKey, setCacheKey] = useState<string>("")
  const router = useRouter()

  const handleRemoveTag = async (repoId: number, tag: string) => {
    setUpdatingTags((prev) => ({ ...prev, [repoId]: true }))
    try {
      const response = await fetch(`/api/repos/${repoId}/tags`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tag }),
          credentials: "include",
        })

        if (response.ok) {
          setRepositories((prev) =>
            prev.map((repo) =>
              repo.id === repoId ? { ...repo, customTags: repo.customTags.filter((t) => t !== tag) } : repo,
            ),
          )
      }
    } catch (error) {
      console.error("Failed to remove tag:", error)
    } finally {
      setUpdatingTags((prev) => ({ ...prev, [repoId]: false }))
    }
  }

  const validateTag = (tag: string): { isValid: boolean; error?: string } => {
    const trimmed = tag.trim()
    if (!trimmed) return { isValid: false, error: "Tag cannot be empty" }
    if (trimmed.length > 50) return { isValid: false, error: "Tag must be 50 characters or less" }
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) return { isValid: false, error: "Tag can only contain letters, numbers, dots, hyphens, and underscores" }
    return { isValid: true }
  }

  const handleAddTag = async (repoId: number, tag: string) => {
    const validation = validateTag(tag)
    if (!validation.isValid) {
      setTagErrors((prev) => ({ ...prev, [repoId]: validation.error! }))
      setTimeout(() => setTagErrors((prev) => ({ ...prev, [repoId]: "" })), 3000)
      return
    }

    const trimmedTag = tag.trim()
    // Check if tag already exists
    const repo = repositories.find(r => r.id === repoId)
    if (repo?.customTags.includes(trimmedTag)) {
      setTagErrors((prev) => ({ ...prev, [repoId]: "Tag already exists for this repository" }))
      setTimeout(() => setTagErrors((prev) => ({ ...prev, [repoId]: "" })), 3000)
      return
    }

    // Clear any existing error
    setTagErrors((prev) => ({ ...prev, [repoId]: "" }))

    setUpdatingTags((prev) => ({ ...prev, [repoId]: true }))
    try {
      const response = await fetch(`/api/repos/${repoId}/tags`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tag: tag.trim() }),
          credentials: "include",
        })

        if (response.ok) {
          setRepositories((prev) =>
            prev.map((repo) => (repo.id === repoId ? { ...repo, customTags: [...repo.customTags, tag.trim()] } : repo)),
          )
        }
      } catch (error) {
        console.error("Failed to add tag:", error)
        // Optimistically update UI even on error
        setRepositories((prev) =>
          prev.map((repo) => (repo.id === repoId ? { ...repo, customTags: [...repo.customTags, tag.trim()] } : repo)),
        )
      } finally {
        setNewTagInputs((prev) => ({ ...prev, [repoId]: "" }))
        setEditingTags((prev) => ({ ...prev, [repoId]: false }))
        setUpdatingTags((prev) => ({ ...prev, [repoId]: false }))
      }
  }

  const toggleTagEditing = (repoId: number) => {
    setEditingTags((prev) => ({ ...prev, [repoId]: !prev[repoId] }))
    if (!editingTags[repoId]) {
      setNewTagInputs((prev) => ({ ...prev, [repoId]: "" }))
    }
  }

  const handleRefreshReadme = () => {
    if (selectedRepo) {
      handleRepoClick(selectedRepo)
    }
  }

  const handleVersionUpdate = (repoId: number, version: string | null) => {
    setRepositories((prev) =>
      prev.map((repo) => {
        if (repo.id === repoId) {
          const updateAvailable = version && repo.latestVersion && version !== repo.latestVersion
          return {
            ...repo,
            currentlyUsedVersion: version || "",
            updateAvailable: !!updateAvailable,
          }
        }
        return repo
      }),
    )
  }

  const handleLogout = async () => {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      })
      router.push("/")
    } catch (error) {
      console.error("Logout failed:", error)
      router.push("/")
    }
  }

  const handleTagToggle = (tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleClearFilters = () => {
    setSelectedTags([])
    setActiveAdvancedFilters([])
  }

  const evaluateAdvancedFilter = useCallback((repo: Repository, expression: string): boolean => {
    if (!expression.trim()) return true

    try {
      let expr = expression.toLowerCase()

      const allTags = [
        ...repo.customTags.map((t) => t.toLowerCase()),
        ...repo.topics.map((t) => t.toLowerCase()),
        ...(repo.language ? [repo.language.toLowerCase()] : []),
      ]

      const tagMatches = expr.match(/\b[a-z0-9-_]+\b/g) || []
      const uniqueTags = [...new Set(tagMatches.filter((tag) => !["and", "or", "not"].includes(tag)))]

      uniqueTags.forEach((tag) => {
        const hasTag = allTags.includes(tag)
        expr = expr.replace(new RegExp(`\\b${tag}\\b`, "g"), hasTag.toString())
      })

      expr = expr.replace(/\band\b/g, "&&")
      expr = expr.replace(/\bor\b/g, "||")
      expr = expr.replace(/\bnot\b/g, "!")

      return Function(`"use strict"; return (${expr})`)()
    } catch (error) {
      console.warn("Invalid filter expression:", expression)
      return true
    }
  }, [])

  const getFilteredRepositories = useCallback((repos: Repository[]) => {
    let filtered = [...repos]

    // Apply search query first
    if (searchQuery) {
      filtered = filtered.filter((repo) => {
        const matchesSearch =
          repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          repo.owner.toLowerCase().includes(searchQuery.toLowerCase())
        return matchesSearch
      })
    }

    // Apply tag filters (AND relationship between selected tags)
    if (selectedTags.length > 0) {
      filtered = filtered.filter((repo) =>
        selectedTags.every(
          (tag) =>
            repo.customTags.some((t) => t.toLowerCase() === tag.toLowerCase()) ||
            repo.topics.some((t) => t.toLowerCase() === tag.toLowerCase()) ||
            (repo.language && repo.language.toLowerCase() === tag.toLowerCase()),
        ),
      )
    }

    // Apply all advanced filters (AND relationship)
    activeAdvancedFilters.forEach((filter) => {
      filtered = filtered.filter((repo) => evaluateAdvancedFilter(repo, filter.expression))
    })

    filtered.sort((a, b) => {
      let aVal, bVal
      switch (sortBy) {
        case "starredAt":
          aVal = new Date(a.starredAt).getTime()
          bVal = new Date(b.starredAt).getTime()
          break
        case "stargazersCount":
          aVal = a.stargazersCount
          bVal = b.stargazersCount
          break
        case "name":
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        default:
          return 0
      }

      if (sortOrder === "desc") {
        return bVal > aVal ? 1 : -1
      } else {
        return aVal > bVal ? 1 : -1
      }
    })

    return filtered
  }, [searchQuery, selectedTags, activeAdvancedFilters, evaluateAdvancedFilter, sortBy, sortOrder])

  const handleAddAdvancedFilter = (expression: string) => {
    if (expression.trim()) {
      const newFilter: AdvancedFilter = {
        id: Date.now().toString(),
        expression: expression.trim(),
      }
      setActiveAdvancedFilters((prev) => [...prev, newFilter])
    }
  }

  const handleRemoveAdvancedFilter = (filterId: string) => {
    setActiveAdvancedFilters((prev) => prev.filter((f) => f.id !== filterId))
  }

  const handleBatchAddTag = async () => {
    const trimmedTag = batchTagInput.trim()
    
    const validation = validateTag(trimmedTag)
    if (!validation.isValid) {
      setBatchTagError(validation.error!)
      setTimeout(() => setBatchTagError(""), 3000)
      return
    }

    setBatchTagError("")
    const currentFilteredRepos = getFilteredRepositories(repositories)
    const reposToUpdate = currentFilteredRepos.filter(repo => !repo.customTags.includes(trimmedTag))
    
    if (reposToUpdate.length === 0) {
      setBatchTagError("All filtered repositories already have this tag")
      setTimeout(() => setBatchTagError(""), 3000)
      return
    }

    setIsBatchTagging(true)
    setBatchTagProgress({ current: 0, total: reposToUpdate.length })

    let successCount = 0
    for (let i = 0; i < reposToUpdate.length; i++) {
      const repo = reposToUpdate[i]
      
      try {
        const response = await fetch(`/api/repos/${repo.id}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tag: trimmedTag }),
          credentials: "include",
        })

        if (response.ok) {
          setRepositories((prev) =>
            prev.map((r) => (r.id === repo.id ? { ...r, customTags: [...r.customTags, trimmedTag] } : r)),
          )
          successCount++
        }
      } catch (error) {
        console.error(`Failed to add tag to repo ${repo.id}:`, error)
        setRepositories((prev) =>
          prev.map((r) => (r.id === repo.id ? { ...r, customTags: [...r.customTags, trimmedTag] } : r)),
        )
        successCount++
      }

      setBatchTagProgress({ current: i + 1, total: reposToUpdate.length })
      if (i < reposToUpdate.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }

    setIsBatchTagging(false)
    setBatchTagInput("")
    setBatchTagProgress({ current: 0, total: 0 })
    setBatchTagError(`Successfully added tag to ${successCount} repositories`)
    setTimeout(() => setBatchTagError(""), 4000)
  }

  const filteredRepositories = getFilteredRepositories(repositories)

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const userResponse = await fetch("/auth/user", {
          credentials: "include",
        })

        if (!userResponse.ok) {
          console.log("[v0] Using mock data for preview environment")
          setUser(mockUser)
          setRepositories(mockRepositories)
          setIsLoading(false)
          return
        }

        const userData = await userResponse.json()
        setUser(userData)

        await Promise.all([loadRepositories()])
      } catch (error) {
        console.error("Failed to initialize app:", error)
        console.log("[v0] API unavailable, using mock data")
        setUser(mockUser)
        setRepositories(mockRepositories)
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()
  }, [router])

  const loadRepositories = useCallback(async (forceRefresh = false) => {
    // Create cache key from current params
    const currentCacheKey = `${sortBy}-${sortOrder}`
    const now = Date.now()
    const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
    
    // Check if we can use cached data (only for non-tag filter changes)
    if (!forceRefresh && 
        cacheKey === currentCacheKey && 
        repositories.length > 0 && 
        (now - lastFetchTime) < CACHE_DURATION) {
      console.log("[Cache] Using cached repositories data")
      return
    }

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      }

      const params = new URLSearchParams({
        sort: sortBy,
        order: sortOrder,
      })

      const response = await fetch(`/api/repos?${params}`, {
        credentials: "include",
        headers,
      })

      if (response.ok) {
        const data = await response.json()
        const repos = data.repos || data
        setRepositories(repos)
        setLastFetchTime(now)
        setCacheKey(currentCacheKey)
        console.log("[API] Loaded fresh repositories data:", repos.length, "repos")
      } else {
        console.log("[v0] API unavailable, using mock data")
        setRepositories(mockRepositories)
      }
    } catch (error) {
      console.error("Failed to load repositories:", error)
      setRepositories(mockRepositories)
    }
  }, [sortBy, sortOrder, cacheKey, repositories.length, lastFetchTime])

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "include",
      })

      if (response.ok) {
        await loadRepositories(true) // Force refresh after sync
      } else {
        console.log("[v0] Simulating sync with mock data")
        await new Promise((resolve) => setTimeout(resolve, 1000))
        setRepositories(mockRepositories)
      }
    } catch (error) {
      console.error("Sync failed:", error)
      setRepositories(mockRepositories)
    } finally {
      setIsSyncing(false)
    }
  }

  const handleRepoClick = async (repo: Repository) => {
    console.log("[v0] handleRepoClick called with repo:", repo.name)
    setSelectedRepo(repo)
    console.log("[v0] selectedRepo state updated, should open modal")
    setIsLoadingReadme(true)
    setReadmeContent("")

    try {
        const response = await fetch(`/api/repos/${repo.fullName}/readme`, {
          headers: {},
          credentials: "include",
        })

        if (response.ok) {
          const data = await response.json()
          setReadmeContent(data.content || data)
        } else {
          console.log("[v0] Using mock README content")
          setReadmeContent(mockReadmeContent)
        }
    } catch (error) {
      console.error("Failed to load README:", error)
      setReadmeContent(mockReadmeContent)
    } finally {
      setIsLoadingReadme(false)
    }
  }

  useEffect(() => {
      // Only load if sorting/ordering changes, tags are applied via client-side filtering
      if (sortBy !== "starredAt" || sortOrder !== "desc") {
        loadRepositories()
      }
  }, [sortBy, sortOrder, loadRepositories])

  useEffect(() => {
    ;(window as any).TagCalculator = TagCalculator
  }, [])

  const displayedRepositories = getFilteredRepositories(repositories)

  return {
    user,
    repositories,
    selectedTags,
    searchQuery,
    sortBy,
    sortOrder,
    isLoading,
    isSyncing,
    selectedRepo,
    readmeContent,
    isLoadingReadme,
    editingTags,
    newTagInputs,
    updatingTags,
    activeAdvancedFilters,
    router,
    handleRemoveTag,
    handleAddTag,
    toggleTagEditing,
    handleRefreshReadme,
    handleVersionUpdate,
    handleLogout,
    handleTagToggle,
    handleClearFilters,
    evaluateAdvancedFilter,
    getFilteredRepositories,
    handleAddAdvancedFilter,
    handleRemoveAdvancedFilter,
    filteredRepositories,
    loadRepositories,
    handleSync,
    handleRepoClick,
    setRepositories,
  }
}
