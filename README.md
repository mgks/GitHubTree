<p align="center">
  <img src="assets/images/banner.png" width="500" alt="GitHubTree Banner">
</p>
<p align="center">  
  <b>With GitHubTree, visualize the directory structure of any <code>public</code> GitHub repository with a clean interface.</b>
</p>

----

**GitHubTree allows you to:**

*   **Explore:**  Easily browse the folder and file organization of a GitHub repo without cloning it.
*   **Copy Paths:**  Quickly copy the path to any file or directory with a single click.
*   **Copy Entire Tree:**  Copy the complete directory structure as plain text, perfect for documentation or sharing.
*   **Jekyll Powered:** Built using the Jekyll static site generator for structure and organization, combined with vanilla JavaScript for GitHub API interaction.
*   **No Authentication Required (for public repos):**  Uses the unauthenticated GitHub API, so you don't need to provide any credentials for public repositories.

<p align="center">
  <img src="assets/images/tree.png" width="750" alt="GitHubTree Repo Preview">
</p>

[**Try GitHubTree**](https://githubtree.mgks.dev)

## How to Use

1.  **Enter Repository:**  Type the GitHub repository name in the format `username/repo` (e.g., `mgks/shaml`).
2.  **Enter Branch (Optional):**  Specify the branch name (defaults to `main`).
3.  **Click "Fetch":**  The tool will retrieve and display the repository's folder structure.
4.  **Copy Individual Paths:** Click the copy icon next to any file or directory to copy its path to your clipboard.
5.  **Copy Entire Tree:** Click the "Copy Complete Tree" button to copy the complete structure as formatted text.

## Use Cases

*   **Quick Overview:**  Get a fast visual understanding of a repository's organization before deciding to clone it.
*   **Documentation:**  Easily generate directory listings for project documentation.
*   **Collaboration:**  Share the structure with others to discuss code organization.
*   **Learning:**  Explore how other projects are structured to improve your own coding practices.

## Local Development & Customization

If you want to run the project locally, customize it, or contribute:

**Prerequisites:**

*   **Ruby:** Ensure you have Ruby installed. Check with `ruby -v`. (Jekyll is Ruby-based). See [Installing Ruby](https://www.ruby-lang.org/en/documentation/installation/).
*   **Bundler:** Install the Bundler gem: `gem install bundler`.

**Steps:**

1.  **Fork the Repository:** Create a fork of this repository on your own GitHub account.
2.  **Clone Your Fork:** Clone your forked repository to your local machine:

    ```bash
    git clone https://github.com/mgks/GitHubTree.git
    cd GitHubTree
    ```
3.  **Install Dependencies:** Install Jekyll and other required gems:

    ```bash
    bundle install
    ```
4.  **Run Locally:** Start the Jekyll development server:

    ```bash
    bundle exec jekyll serve
    ```
    This will build the site and serve it locally (usually at `http://localhost:4000`). Changes you make to most files will trigger an automatic rebuild.
5.  **Make Changes:** Modify the source files as needed. Key areas include:
    *   `_config.yml`: Site-wide configuration.
    *   `_layouts/`: HTML layout templates.
    *   `_includes/`: Reusable HTML snippets.
    *   `assets/`: CSS, JavaScript (`script.js`), images.
    *   `_data/`: Data files (like `repositories.json`).
    *   `index.html`, `404.html`, etc.: Page content files.
6.  **Commit and Push:** Commit your changes and push them to your forked repository:

    ```bash
    git add .
    git commit -m "Describe your changes"
    git push origin main # Or your default branch name
    ```

## Deployment

This project is automatically deployed to GitHub Pages using a **GitHub Actions workflow**.

*   When changes are pushed to the `main` branch (or your configured default branch), the workflow runs.
*   The workflow installs dependencies (`bundle install`) and builds the Jekyll site (`bundle exec jekyll build`).
*   It then takes the generated static files from the `_site` directory and deploys them to the `gh-pages` branch (or whichever branch is configured for GitHub Pages hosting).
*   **Important:** GitHub Pages serves the content from the deployment branch (`gh-pages`), *not* directly from your source code branch (`main`). Ensure GitHub Pages is enabled in your repository settings (Settings > Pages) and configured to deploy from the correct branch (`gh-pages`).

## Accessing Private Repositories (Advanced & Use With Extreme Caution)

**Major Security Warning:** This tool, as deployed publicly, **cannot securely access private repositories.** The primary fetching logic runs in the user's browser (client-side JavaScript). Embedding API keys or tokens directly into client-side code is a **severe security risk**, as they can be easily extracted by anyone viewing the page source.

To access *your own* private repositories using a modified version of this tool, you **must**:

1.  **Fork this project.**
2.  **Make your fork PRIVATE.** Never make it public if you follow these steps.
3.  **Obtain a GitHub Personal Access Token (PAT)** with the `repo` scope. Treat this token like a password.
4.  **Modify `assets/js/script.js` in your PRIVATE fork:** Hardcode your PAT into the `GITHUB_PAT` constant within the script.
5.  **Commit and push ONLY to your PRIVATE repository.**

**Deployment of Private Fork:**

*   The GitHub Actions workflow in your private fork will build the site (including the script with your embedded PAT).
*   It will deploy the built site (from `_site`) to the `gh-pages` branch of your private repository.
*   You can enable GitHub Pages on your private repository (Settings > Pages) to serve from the `gh-pages` branch. The resulting URL will likely be accessible only to you (or collaborators on the private repo, depending on your GitHub plan settings).

**Reiteration of Warnings:**
*   **Never make your forked repository public if it contains your PAT hardcoded in `script.js`.** Your token will be exposed.
*   This method embeds your token directly into the deployed JavaScript. **Anyone who can access the deployed GitHub Pages site for your private fork might be able to extract the token.**
*   This modified version is strictly for **your personal use on a private fork** where you understand and accept the security risks.
*   Regularly review and rotate your PATs. Consider more secure server-side proxy solutions if robust private repository access is needed.

## Contributing

Contributions are welcome! Please feel free to submit pull requests with bug fixes, improvements, or new features against the original `mgks/GitHubTree` repository.

## License

This project is published under the MIT License - see [LICENSE](LICENSE) file for details or read [MIT license](https://opensource.org/licenses/MIT).

## Support the Project

**[GitHub Sponsors](https://github.com/sponsors/mgks):** You can support GitHubTree and my other projects by becoming a monthly or one-time GitHub sponsor.

**[Follow Me](https://github.com/mgks) on GitHub** | **Add Project to Watchlist** | **Star the Project**

<br /><img src="https://forthebadge.com/images/badges/built-with-love.svg" alt="Built with Love">
