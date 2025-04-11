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
*   **Fast and Lightweight:**  Built with vanilla JavaScript, HTML, and CSS for optimal performance.
*   **No Authentication Required (for public repos):**  Uses the unauthenticated GitHub API, so you don't need to provide any credentials for public repositories.

<p align="center">
  <img src="assets/images/tree.png" width="750" alt="GitHubTree Repo Preview">
</p>

[**Try GitHubTree**](https://githubtree.mgks.dev)

## How to Use

1.  **Enter Repository:**  Type the GitHub repository name in the format `username/repo` (e.g., `mgks/shaml`).
2.  **Enter Branch (Optional):**  Specify the branch name (defaults to `main`).
3.  **Click "Fetch Tree":**  The tool will retrieve and display the repository's folder structure.
4.  **Copy Individual Paths:** Click the copy icon next to any file or directory to copy its path to your clipboard.
5.  **Copy Entire Tree:** Click the "Copy Whole Tree" button to copy the complete structure as formatted text.

## Use Cases

*   **Quick Overview:**  Get a fast visual understanding of a repository's organization before deciding to clone it.
*   **Documentation:**  Easily generate directory listings for project documentation.
*   **Collaboration:**  Share the structure with others to discuss code organization.
*   **Learning:**  Explore how other projects are structured to improve your own coding practices.

## Rebuilding the Project

If you want to customize the tool or contribute, you can easily rebuild it:

1.  **Fork the Repository:** Create a fork of this repository on your own GitHub account.
2.  **Clone Your Fork:** Clone your forked repository to your local machine:

    ```bash
    git clone https://github.com/mgks/GitHubTree.git
    cd github-folder-structure
    ```
3.  **Make Changes:** Modify the `index.html`, `script.js`, or `style.css` files as needed.
4.  **Commit and Push:** Commit your changes and push them to your forked repository:

    ```bash
    git add .
    git commit -m "GitHubTree script update"
    git push origin main
    ```

5.  **GitHub Pages Deployment:** The project is automatically deployed to GitHub Pages using GitHub Actions.  Make sure GitHub Pages is enabled in your forked repository's settings (Settings > Pages).  It should be set to deploy from the `main` branch (or your default branch) and the root directory (`/`).

## Accessing Private Repositories (Advanced)

**Important Security Note:** This tool, as deployed publicly, *cannot* directly access private repositories due to security restrictions. Exposing API keys or tokens in client-side JavaScript intended for public use is a major security risk.

To access *your own* private repositories using this tool, you **must fork this project**, keep your fork **private**, and modify it to include your GitHub Personal Access Token (PAT):

1.  **Fork the Repository:** Create a fork of this repository on your own GitHub account. **Crucially, ensure your forked repository is set to PRIVATE.**
2.  **Create a PAT:**
    *   Go to your GitHub settings: [https://github.com/settings/tokens](https://github.com/settings/tokens)
    *   Click "Generate new token" (or "Generate new token (classic)").
    *   Give the token a descriptive name (e.g., "GitHubTree Private Access").
    *   Select the `repo` scope. This grants access to your private repositories. **Do not select any other scopes unless absolutely necessary.**
    *   Click "Generate token."
    *   **Copy the token immediately.** You won't be able to see it again. Treat this token like a password.

3.  **Clone Your Private Fork:** Clone your **private** forked repository to your local machine:

    ```bash
    # Replace YOUR_USERNAME with your GitHub username
    git clone https://github.com/YOUR_USERNAME/GitHubTree.git
    cd GitHubTree 
    ```
    *(Note: The directory name might be `GitHubTree` or `github-folder-structure` depending on how you cloned).*

4.  **Modify `script.js` (Crucially Important):**
    *   Open the `script.js` file in your local clone.
    *   Find the following line near the top of the file:
        ```javascript
        const GITHUB_PAT = ""; // IMPORTANT: Replace with your Personal Access Token ONLY in your PRIVATE fork...
        ```
    *   **Replace the empty string `""` with the Personal Access Token you generated in Step 2.** It should look like this (replace `YOUR_ACTUAL_TOKEN_HERE` with your real token):
        ```javascript
        const GITHUB_PAT = "YOUR_ACTUAL_TOKEN_HERE"; // IMPORTANT: Replace with your Personal Access Token ONLY in your PRIVATE fork...
        ```
    *   **Save the `script.js` file.**

5.  **Commit and Push to Your Private Fork:** Commit your changes (which now include your PAT directly in the script) and push them to your *private* forked repository:

    ```bash
    git add script.js
    git commit -m "Add PAT for private repo access"
    git push origin main 
    ```
    *(Replace `main` if your default branch has a different name).*

6.  **GitHub Pages Deployment (from Private Fork):**
    *   Go to your **private** forked repository's settings on GitHub (Settings > Pages).
    *   Ensure GitHub Pages is enabled. It should be set to deploy from the `main` branch (or your default branch) and the root directory (`/`).
    *   GitHub Actions should automatically build and deploy your modified version to its own GitHub Pages URL (e.g., `https://YOUR_USERNAME.github.io/GitHubTree/`).

**Warning:**
*   **Never make your forked repository public if it contains your PAT hardcoded in the `script.js` file.** Anyone who can view the code (even the deployed JavaScript source on the GitHub Pages site) could potentially extract your PAT and gain access to your repositories.
*   This method embeds your token directly into the deployed JavaScript. While convenient for personal use on a private fork deployed to a potentially restricted GitHub Pages site, it carries inherent risks if the code or the deployment URL becomes accessible to others.
*   **This modified version is strictly for your personal use to access your *own* private repositories.** Do not share the URL of your deployed private version widely.
*   Regularly review and consider rotating your PATs.

## Contributing

Contributions are welcome!  Please feel free to submit pull requests with bug fixes, improvements, or new features.

## License

This project is published under the MIT License - see [LICENSE](LICENSE) file for details or read [MIT license](https://opensource.org/licenses/MIT).

## Support the Project

**[GitHub Sponsors](https://github.com/sponsors/mgks):** Support this project and my other work by becoming a GitHub sponsor, it means a lot :)

**[Follow Me](https://github.com/mgks) on GitHub** | **Add Project to Watchlist** | **Star the Project**

<br /><img src="https://forthebadge.com/images/badges/built-with-love.svg" alt="Built with Love">
